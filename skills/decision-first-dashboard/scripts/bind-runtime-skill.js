import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BINDING_TYPES = Object.freeze(['junction', 'symlink', 'copied-directory']);

export class RuntimeBindingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeBindingError';
    this.code = code;
    this.details = details;
  }
}

function realpathSync(fsImpl, targetPath) {
  const realpath = fsImpl.realpathSync;
  if (typeof realpath.native === 'function') return realpath.native(targetPath);
  return realpath(targetPath);
}

export function resolvePhysicalTarget(targetPath, { fsImpl = fs } = {}) {
  return realpathSync(fsImpl, path.resolve(targetPath));
}

function samePhysicalPath(left, right, platform = process.platform) {
  if (platform === 'win32') return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function windowsLinkType(targetPath, platform) {
  if (platform !== 'win32') return null;
  try {
    const escaped = String(targetPath).replace(/'/g, "''");
    const script = `$item = Get-Item -LiteralPath '${escaped}' -Force; if ($null -eq $item.LinkType) { '' } else { $item.LinkType }`;
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ], { encoding: 'utf8' }).trim().toLowerCase();
    if (output === 'junction') return 'junction';
    if (output === 'symboliclink') return 'symlink';
  } catch {
    // Fall through to the native lstat/readlink checks below.
  }
  return null;
}

export function detectRuntimeBinding(runtimeSkillPath, {
  fsImpl = fs,
  platform = process.platform
} = {}) {
  const targetPath = path.resolve(runtimeSkillPath);
  let stat;
  try {
    stat = fsImpl.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }

  if (platform === 'win32') {
    const linkType = windowsLinkType(targetPath, platform);
    if (linkType) return linkType;
  }

  if (stat.isSymbolicLink()) return 'symlink';

  if (platform === 'win32') {
    try {
      fsImpl.readlinkSync(targetPath);
      return 'junction';
    } catch {
      // A regular directory does not have a link target.
    }
  }

  if (stat.isDirectory()) return 'copied-directory';
  return null;
}

function validateRepositorySkill(repoSkillPath, fsImpl) {
  const resolved = resolvePhysicalTarget(repoSkillPath, { fsImpl });
  if (!fsImpl.statSync(resolved).isDirectory()) {
    throw new RuntimeBindingError(
      'REPO_SKILL_NOT_DIRECTORY',
      'Repository Skill path must resolve to a directory',
      { repoSkillPath, resolved }
    );
  }
  return resolved;
}

function createPreferredBinding(repoSkillPath, runtimeSkillPath, {
  fsImpl,
  platform
}) {
  fsImpl.mkdirSync(path.dirname(runtimeSkillPath), { recursive: true });

  if (platform === 'win32') {
    try {
      fsImpl.symlinkSync(repoSkillPath, runtimeSkillPath, 'junction');
      return 'junction';
    } catch (junctionError) {
      try {
        fsImpl.symlinkSync(repoSkillPath, runtimeSkillPath, 'dir');
        return 'symlink';
      } catch (symlinkError) {
        throw new RuntimeBindingError(
          'RUNTIME_BINDING_CREATE_FAILED',
          'Unable to create a Windows directory junction or symlink',
          {
            repoSkillPath,
            runtimeSkillPath,
            junctionError: junctionError.message,
            symlinkError: symlinkError.message
          }
        );
      }
    }
  }

  try {
    fsImpl.symlinkSync(repoSkillPath, runtimeSkillPath, 'dir');
    return 'symlink';
  } catch (error) {
    throw new RuntimeBindingError(
      'RUNTIME_BINDING_CREATE_FAILED',
      'Unable to create a directory symlink for the runtime Skill',
      { repoSkillPath, runtimeSkillPath, error: error.message }
    );
  }
}

function assertBackupDestination(runtimeSkillPath, backupExisting, fsImpl) {
  if (typeof backupExisting !== 'string' || backupExisting.trim() === '') {
    throw new RuntimeBindingError(
      'COPIED_DIRECTORY_REQUIRES_EXPLICIT_BACKUP',
      'An existing copied runtime Skill requires an explicit backup destination; it will not be overwritten',
      { runtimeSkillPath }
    );
  }

  const resolvedRuntime = path.resolve(runtimeSkillPath);
  const backupPath = path.resolve(backupExisting);
  if (backupPath === resolvedRuntime) {
    throw new RuntimeBindingError(
      'INVALID_BACKUP_DESTINATION',
      'Backup destination must differ from the runtime Skill path',
      { runtimeSkillPath, backupExisting }
    );
  }
  if (fsImpl.existsSync(backupPath)) {
    throw new RuntimeBindingError(
      'BACKUP_DESTINATION_EXISTS',
      'Backup destination already exists; refusing to overwrite it',
      { backupPath }
    );
  }
  return backupPath;
}

export function ensureRuntimeSkillBinding({
  repoSkillPath,
  runtimeSkillPath,
  backupExisting = null,
  fsImpl = fs,
  platform = process.platform
}) {
  if (!repoSkillPath || !runtimeSkillPath) {
    throw new RuntimeBindingError(
      'BINDING_PATHS_REQUIRED',
      'repoSkillPath and runtimeSkillPath are required'
    );
  }

  const resolvedRepoSkillPath = validateRepositorySkill(repoSkillPath, fsImpl);
  const resolvedRuntimeSkillPath = path.resolve(runtimeSkillPath);
  const existingBinding = detectRuntimeBinding(resolvedRuntimeSkillPath, { fsImpl, platform });

  if (existingBinding === 'junction' || existingBinding === 'symlink') {
    const physicalTarget = resolvePhysicalTarget(resolvedRuntimeSkillPath, { fsImpl });
    if (!samePhysicalPath(physicalTarget, resolvedRepoSkillPath, platform)) {
      throw new RuntimeBindingError(
        'PHYSICAL_TARGET_MISMATCH',
        'Existing runtime link points at a different physical directory; refusing to overwrite it',
        {
          runtimeSkillPath: resolvedRuntimeSkillPath,
          expectedPhysicalTarget: resolvedRepoSkillPath,
          actualPhysicalTarget: physicalTarget,
          bindingType: existingBinding
        }
      );
    }
    return {
      bindingType: existingBinding,
      physicalTarget,
      runtimeSkillPath: resolvedRuntimeSkillPath,
      repoSkillPath: resolvedRepoSkillPath,
      backupPath: null
    };
  }

  if (existingBinding === 'copied-directory') {
    const backupPath = assertBackupDestination(resolvedRuntimeSkillPath, backupExisting, fsImpl);
    fsImpl.mkdirSync(path.dirname(backupPath), { recursive: true });
    fsImpl.renameSync(resolvedRuntimeSkillPath, backupPath);
    try {
      const bindingType = createPreferredBinding(resolvedRepoSkillPath, resolvedRuntimeSkillPath, { fsImpl, platform });
      const physicalTarget = resolvePhysicalTarget(resolvedRuntimeSkillPath, { fsImpl });
      if (!samePhysicalPath(physicalTarget, resolvedRepoSkillPath, platform)) {
        throw new RuntimeBindingError(
          'PHYSICAL_TARGET_MISMATCH',
          'Created runtime binding does not resolve to the repository Skill directory',
          { expectedPhysicalTarget: resolvedRepoSkillPath, actualPhysicalTarget: physicalTarget }
        );
      }
      return {
        bindingType,
        physicalTarget,
        runtimeSkillPath: resolvedRuntimeSkillPath,
        repoSkillPath: resolvedRepoSkillPath,
        backupPath
      };
    } catch (error) {
      if (!fsImpl.existsSync(resolvedRuntimeSkillPath) && fsImpl.existsSync(backupPath)) {
        fsImpl.renameSync(backupPath, resolvedRuntimeSkillPath);
      }
      throw error;
    }
  }

  if (fsImpl.existsSync(resolvedRuntimeSkillPath)) {
    throw new RuntimeBindingError(
      'RUNTIME_TARGET_UNSUPPORTED',
      'Existing runtime target is not a directory link or copied directory; refusing to overwrite it',
      { runtimeSkillPath: resolvedRuntimeSkillPath }
    );
  }

  const bindingType = createPreferredBinding(resolvedRepoSkillPath, resolvedRuntimeSkillPath, { fsImpl, platform });
  const physicalTarget = resolvePhysicalTarget(resolvedRuntimeSkillPath, { fsImpl });
  if (!samePhysicalPath(physicalTarget, resolvedRepoSkillPath, platform)) {
    throw new RuntimeBindingError(
      'PHYSICAL_TARGET_MISMATCH',
      'Created runtime binding does not resolve to the repository Skill directory',
      { expectedPhysicalTarget: resolvedRepoSkillPath, actualPhysicalTarget: physicalTarget }
    );
  }
  return {
    bindingType,
    physicalTarget,
    runtimeSkillPath: resolvedRuntimeSkillPath,
    repoSkillPath: resolvedRepoSkillPath,
    backupPath: null
  };
}

function parseArgs(argv) {
  const args = { repoSkillPath: null, runtimeSkillPath: null, backupExisting: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-skill-path') args.repoSkillPath = argv[++index];
    else if (arg === '--runtime-skill-path') args.runtimeSkillPath = argv[++index];
    else if (arg === '--backup-existing') args.backupExisting = argv[++index];
    else if (!args.repoSkillPath) args.repoSkillPath = arg;
    else if (!args.runtimeSkillPath) args.runtimeSkillPath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = ensureRuntimeSkillBinding(args);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: error.code ?? 'RUNTIME_BINDING_FAILED',
      message: error.message,
      details: error.details ?? {}
    })}\n`);
    process.exitCode = 1;
  }
}
