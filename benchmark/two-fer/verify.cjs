// Runs Exercism's three JUnit cases, all enabled. Generated classes only in target/.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
fs.mkdirSync('target/classes', { recursive: true })
for (const args of [
  ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-cp', 'lib/junit-platform-console-standalone-1.10.0.jar:lib/assertj-core-3.25.1.jar', '-d', 'target/classes', 'src/main/java/Twofer.java', 'src/test/java/TwoferTest.java'],
  ['-jar', 'lib/junit-platform-console-standalone-1.10.0.jar', 'execute', '--class-path', 'target/classes:lib/assertj-core-3.25.1.jar', '--select-class', 'TwoferTest', '--fail-if-no-tests', '--disable-ansi-colors'],
]) {
  const result = spawnSync('java', args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}
