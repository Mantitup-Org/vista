import execa from 'execa'
import fs from 'fs/promises'
import path from 'path'

export async function generatePackageJson(folder, withLocalVista = false) {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(folder, 'package.json'))
  )

  const currentVersions = await getCurrentRootReactPackagesVersions()

  packageJson.dependencies = packageJson.dependencies || {}
  packageJson.dependencies.react = currentVersions.react
  packageJson.dependencies['react-dom'] = currentVersions['react-dom']
  if (withLocalVista) {
    packageJson.dependencies.vista = await packVistaBuild(folder)
  } else {
    packageJson.dependencies.vista = await getCurrentVistaVersion()
  }

  await fs.writeFile(
    path.join(folder, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  )
}

export async function packVistaBuild(folder) {
  const process = await execa('npm', [
    'pack',
    '../../packages/vista',
    `--pack-destination=${folder}`,
  ])

  return `file:./${process.stdout}`
}

async function getCurrentVistaVersion() {
  const packageJson = JSON.parse(
    await fs.readFile('../../packages/vista/package.json', 'utf8')
  )
  return packageJson.version
}

async function getCurrentRootReactPackagesVersions() {
  const packageJson = JSON.parse(
    await fs.readFile('../../package.json', 'utf8')
  )
  return {
    react: packageJson.devDependencies.react,
    'react-dom': packageJson.devDependencies['react-dom'],
  }
}
