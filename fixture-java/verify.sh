#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p target/classes
if command -v javac >/dev/null 2>&1; then
  find src -name '*.java' -print0 | xargs -0 javac -d target/classes
else
  find src -name '*.java' -print0 | xargs -0 java -m jdk.compiler/com.sun.tools.javac.Main -d target/classes
fi
java -ea -cp target/classes demo.BookshopTests
