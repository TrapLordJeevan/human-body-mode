#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/project/target" "$root/project/.human-body-mode"
printf source > "$root/project/Main.java"
/usr/bin/bwrap --ro-bind / / --dev-bind /dev /dev --proc /proc --tmpfs /tmp \
  --ro-bind "$root/project" "$root/project" \
  --bind "$root/project/target" "$root/project/target" \
  --bind "$root/project/.human-body-mode" "$root/project/.human-body-mode" \
  --chdir "$root/project" -- /bin/sh -c \
  'touch target/output.class; touch .human-body-mode/log.json; ! printf bypass > Main.java'
test "$(cat "$root/project/Main.java")" = source
test -f "$root/project/target/output.class"
echo "sandbox: source read-only, build/log output writable"
