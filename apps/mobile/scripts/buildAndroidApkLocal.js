const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appDirectory = path.resolve(__dirname, '..');
const androidDirectory = path.join(appDirectory, 'android');

function javaExecutable(javaHome) {
  return path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

function isUsableJavaHome(candidate) {
  if (!candidate) return false;
  const java = javaExecutable(candidate);
  if (!fs.existsSync(java)) return false;
  const probe = spawnSync(java, ['-version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function findJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:\\Program Files\\Android\\openjdk\\jdk-21.0.8',
    'C:\\Program Files\\Android\\openjdk\\jdk-17.0.12',
    'C:\\Program Files\\Android\\Android Studio\\jbr'
  ];

  return candidates.find(isUsableJavaHome) ?? null;
}

function findAndroidSdk() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')
  );
}

const javaHome = findJavaHome();
if (!javaHome) {
  console.error('No usable JDK was found. Set JAVA_HOME to a JDK 17+ installation and retry.');
  process.exit(1);
}

const androidSdk = findAndroidSdk();
if (!androidSdk || !fs.existsSync(androidSdk)) {
  console.error('No Android SDK was found. Set ANDROID_HOME to your Android SDK and retry.');
  process.exit(1);
}

const gradleWrapper = path.join(
  androidDirectory,
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);

if (!fs.existsSync(gradleWrapper)) {
  console.error(`Gradle wrapper not found: ${gradleWrapper}`);
  process.exit(1);
}

console.log(`Using JDK: ${javaHome}`);
console.log(`Using Android SDK: ${androidSdk}`);
console.log('Building installable Android APK with Gradle...');

const result = (() => {
  const gradleArgs = ['assembleRelease', '--no-daemon'];
  if (process.platform !== 'win32') {
    return spawnSync(gradleWrapper, gradleArgs, {
      cwd: androidDirectory,
      stdio: 'inherit',
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: androidSdk
      }
    });
  }

  const command = process.env.ComSpec || 'cmd.exe';
  const commandLine = [gradleWrapper, ...gradleArgs]
    .map((argument) => `"${argument.replace(/"/g, '""')}"`)
    .join(' ');

  return spawnSync(command, ['/d', '/s', '/c', commandLine], {
    cwd: androidDirectory,
    stdio: 'inherit',
    windowsVerbatimArguments: true,
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: androidSdk
    }
  });
})();

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const apkPath = path.join(
  androidDirectory,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

if (!fs.existsSync(apkPath)) {
  console.error(`Build finished, but the expected APK was not found: ${apkPath}`);
  process.exit(1);
}

console.log('');
console.log('Local APK build complete.');
console.log(`Installable APK: ${apkPath}`);
console.log('Copy that file to your phone and open it to install.');
