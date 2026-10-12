# Small public Java benchmark selection

Research date: 2026-10-12. This selects an integration smoke benchmark, not a representative 3–4 hour engineering competition.

## Recommendation: Exercism Java Two Fer

Use the [official Exercism Java repository](https://github.com/exercism/java), pinned to commit [`9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d`](https://github.com/exercism/java/commit/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d), retrieved from the repository's main branch on the research date. The [exercise instructions](https://github.com/exercism/java/blob/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/exercises/practice/two-fer/.docs/instructions.md) require constructing a greeting using a supplied name, with a fallback when no name is supplied. The [starter](https://github.com/exercism/java/blob/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/exercises/practice/two-fer/src/main/java/Twofer.java) deliberately throws an exception. The [upstream tests](https://github.com/exercism/java/blob/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/exercises/practice/two-fer/src/test/java/TwoferTest.java) cover null, Alice, and Bob.

Inference: this needs roughly 70–150 newly authored characters if editing just the method, or roughly 150–250 characters if replacing the whole class. It is consequently suitable for checking that a real model reads the repository, uses the actual editor typing queue, and runs genuine Java tests without a long paid model session. It is much too trivial to compare reasoning ability or human-versus-AI productivity. Public solutions may also be memorized by models.

The repository is [MIT licensed](https://github.com/exercism/java/blob/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/LICENSE). Retain the complete license and copyright notice when vendoring files. Do not download `.meta/Example.java` into the agent-visible task: that would allow copying an existing solution instead of authoring one.

## Exact fetch URLs

All source downloads share this immutable base:

```text
https://raw.githubusercontent.com/exercism/java/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/
```

Fetch these relative paths into a dedicated disposable project:

- `LICENSE`
- `exercises/practice/two-fer/.docs/instructions.md`
- `exercises/practice/two-fer/src/main/java/Twofer.java`
- `exercises/practice/two-fer/src/test/java/TwoferTest.java`
- `exercises/practice/two-fer/build.gradle`

The task also ships `gradlew`, `gradlew.bat`, and `gradle/wrapper/`, but downloading a Gradle distribution is unnecessary for this small integration test.

## Running the real upstream tests without Gradle

The [upstream build](https://github.com/exercism/java/blob/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/exercises/practice/two-fer/build.gradle) specifies JUnit BOM 5.10.0 and AssertJ 3.25.1. Its tests need only JUnit Jupiter and AssertJ. The following Maven Central artifacts were verified available (HTTP 200):

- [JUnit Platform standalone console 1.10.0](https://repo.maven.apache.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.0/junit-platform-console-standalone-1.10.0.jar)
- [AssertJ Core 3.25.1](https://repo.maven.apache.org/maven2/org/assertj/assertj-core/3.25.1/assertj-core-3.25.1.jar)

Prepare these dependencies before starting the experiment clock. Upstream disables the Alice and Bob tests by default; remove both `@Disabled` annotations in the prepared fixture before baseline, and explicitly record that preparation. Otherwise a misleading one-test pass is possible. Keep the assertions unchanged.

Put dependencies in `lib/`, then use a fixed `verify.sh` prepared before the run:

```sh
mkdir -p target/classes
java -m jdk.compiler/com.sun.tools.javac.Main -cp 'lib/*' -d target/classes src/main/java/Twofer.java src/test/java/TwoferTest.java
java -jar lib/junit-platform-console-standalone-1.10.0.jar execute --class-path target/classes:lib/assertj-core-3.25.1.jar --select-class TwoferTest --fail-if-no-tests
```

This environment has `java` and its `jdk.compiler` module but no standalone `javac` executable; this compiler invocation matches the existing disposable fixture's fallback. Test execution must first fail against the unmodified starter. After the model's edit, require all three tests to pass and zero skipped tests. Treat `verify.sh` as a supervisor-approved fixed command; reject arbitrary replacement scripts or generated solutions. Check that the test file, script, dependencies, and instructions retain their pre-run hashes.

## What this can establish

A successful real Codex run can establish Codex tool integration, actual editor edits, paced typing, real compilation and testing, and measured wall-clock/action time on this task. Capture the model transcript, final source diff, broker logs, and both baseline/final test output. Compare newly authored characters with physical-action timing rather than relying only on the model's completion claim.

It cannot establish Claude compatibility. Claude and Codex share the broker and timing core but use different tool interception adapters and lifecycle APIs. Claude needs its own end-to-end run when usage becomes available. It also cannot establish comprehensive bypass resistance, subagent fairness, or full competition representativeness from one trivial task.
