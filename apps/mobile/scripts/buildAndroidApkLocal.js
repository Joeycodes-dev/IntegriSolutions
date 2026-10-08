const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appDirectory = path.resolve(__dirname, '..');
const androidDirectory = path.join(appDirectory, 'android');
const DEFAULT_API_BASE_URL = 'https://integri-backend.smuurt.workers.dev/api';
const DEFAULT_BREATHALYZER_SIMULATION = '1';

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

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
const breathalyzerSimulation =
  process.env.EXPO_PUBLIC_BREATHALYZER_SIMULATION || DEFAULT_BREATHALYZER_SIMULATION;
const supabaseRealtimeEnabled = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

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
console.log(`Using API base URL: ${apiBaseUrl}`);
console.log(`Breathalyzer simulation fallback: ${breathalyzerSimulation}`);
console.log(
  `Supabase realtime: ${supabaseRealtimeEnabled ? 'enabled' : 'disabled (REST polling fallback)'}`,
);
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
        ANDROID_HOME: androidSdk,
        NODE_ENV: process.env.NODE_ENV || 'production',
        EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
        EXPO_PUBLIC_BREATHALYZER_SIMULATION: breathalyzerSimulation
      }
    });
  }

  const command = 'powershell.exe';
  const quotedWrapper = gradleWrapper.replace(/'/g, "''");
  const quotedArgs = gradleArgs.map((argument) => `'${argument.replace(/'/g, "''")}'`).join(' ');
  const commandLine = `& '${quotedWrapper}' ${quotedArgs}`;

  return spawnSync(command, ['-NoProfile', '-NonInteractive', '-Command', commandLine], {
    cwd: androidDirectory,
    stdio: 'inherit',
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: androidSdk,
      NODE_ENV: process.env.NODE_ENV || 'production',
      EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
      EXPO_PUBLIC_BREATHALYZER_SIMULATION: breathalyzerSimulation
    }
  });
})();

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// With the ABI splits enabled in app/build.gradle, Gradle emits one APK per ABI
// plus a universal APK instead of a single app-release.apk. Collect whatever
// landed in the output directory so the summary stays correct either way.
const releaseOutputDirectory = path.join(
  androidDirectory,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
);

if (!fs.existsSync(releaseOutputDirectory)) {
  console.error(
    `Build finished, but the APK output directory was not found: ${releaseOutputDirectory}`,
  );
  process.exit(1);
}

const apks = fs
  .readdirSync(releaseOutputDirectory)
  .filter((entry) => entry.toLowerCase().endsWith('.apk'))
  .map((entry) => {
    const fullPath = path.join(releaseOutputDirectory, entry);
    return { name: entry, path: fullPath, sizeMb: fs.statSync(fullPath).size / (1024 * 1024) };
  })
  .sort((left, right) => left.sizeMb - right.sizeMb);

if (apks.length === 0) {
  console.error(`Build finished, but no APK was found in: ${releaseOutputDirectory}`);
  process.exit(1);
}

console.log('');
console.log('Local APK build complete.');
console.log('');
console.log('Installable APKs:');
for (const apk of apks) {
  console.log(`  ${apk.name.padEnd(34)} ${apk.sizeMb.toFixed(1)} MB`);
  console.log(`  ${' '.repeat(34)} ${apk.path}`);
}
console.log('');
console.log('Install the arm64-v8a APK on a modern handset, armeabi-v7a on an older');
console.log('one, and x86_64 on an Android emulator. The universal APK works everywhere');
console.log('but is the largest download.');
