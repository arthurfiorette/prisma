import execa from 'execa'
import path from 'path'
import tempy from 'tempy'
import fs from 'fs'
import resolvePkg from 'resolve-pkg'
import tar from 'tar'
import copy from '@apexearth/copy'
import makeDir from 'make-dir'
import { promisify } from 'util'
import rimraf from 'rimraf'
import Debug from 'debug'
import readPkgUp from 'read-pkg-up'
const debug = Debug('getPackedPackage')

// why not directly use Sindre's 'del'? Because it's not ncc-able :/
const del = promisify(rimraf)

export async function getPackedPackage(
  name: string,
  target: string,
  packageDir?: string,
): Promise<void> {
  if (!target) {
    throw new Error(`Error in getPackage: Please provide a target`)
  }
  packageDir =
    packageDir ||
    resolvePkg(name, { cwd: __dirname }) ||
    resolvePkg(name, { cwd: target })

  debug({ packageDir })

  if (!packageDir) {
    const pkg = await readPkgUp({
      cwd: target,
    })
    if (pkg && pkg.packageJson.name === name) {
      packageDir = path.dirname(pkg.path)
    }
  }

  if (!packageDir && fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    packageDir = process.cwd()
  }

  if (!packageDir) {
    throw new Error(
      `Error in getPackage: Could not resolve package ${name} from ${__dirname}`,
    )
  }
  const tmpDir = tempy.directory() // thanks Sindre
  const archivePath = path.join(tmpDir, `package.tgz`)

  // pack into a .tgz in a tmp dir
  await execa.command(`yarn pack -f ${archivePath}`, {
    shell: true,
    cwd: packageDir,
  })

  // extract and delete the archive
  await tar.extract({
    cwd: tmpDir,
    file: archivePath,
  })

  await del(archivePath)

  // make target dir
  await makeDir(target)

  // copy stuff over
  await copy({
    from: path.join(tmpDir, 'package'), // when using yarn pack and extracting it, it includes a folder called "package"
    to: target,
    recursive: true,
    parallelJobs: 20,
    overwrite: true,
  })

  // delete tmp dir
  await del(tmpDir)
}
