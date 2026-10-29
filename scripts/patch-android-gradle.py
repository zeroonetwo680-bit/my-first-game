#!/usr/bin/env python3
"""Patch the Capacitor-generated Android app for a Google Play release.

Capacitor's template ships `versionCode 1` / `versionName "1.0"` and no release
signing config, which is fine for a debug APK and useless for Play. This rewrites
only what is needed, and asserts on every edit so a template change upstream
fails loudly here instead of producing a silently-wrong bundle.

Usage:
    python3 scripts/patch-android-gradle.py <app/build.gradle> \
        --version-code 7 --version-name 1.7 [--sign]

--sign injects a signingConfig that reads the keystore path and passwords from
the environment (KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD), so
no secret is ever written into a checked-in file.
"""
import argparse
import re
import sys


def replace_once(text, pattern, repl, label):
    out, n = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if n != 1:
        sys.exit('ERROR: could not find %s (pattern: %r). '
                 'Capacitor may have changed its template.' % (label, pattern))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gradle')
    ap.add_argument('--version-code', required=True, type=int)
    ap.add_argument('--version-name', required=True)
    ap.add_argument('--sign', action='store_true')
    args = ap.parse_args()

    with open(args.gradle, encoding='utf-8') as fh:
        s = fh.read()

    if args.version_code < 1:
        sys.exit('ERROR: versionCode must be >= 1 (Play rejects 0)')
    if not re.match(r'^\d+(\.\d+){0,2}([a-z0-9.\-]*)?$', args.version_name):
        sys.exit('ERROR: versionName %r is not a valid Play version string' % args.version_name)

    s = replace_once(
        s, r'^\s*versionCode\s+\d+\s*$',
        '        versionCode %d' % args.version_code,
        'versionCode')

    s = replace_once(
        s, r'^\s*versionName\s+"[^"]*"\s*$',
        '        versionName "%s"' % args.version_name,
        'versionName')

    if args.sign:
        # Play App Signing uses an upload key. Reading it from the environment
        # keeps the keystore and its passwords out of the repository.
        signing = """
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
"""
        s = replace_once(
            s,
            r'^(\s*defaultConfig\s*\{)',
            lambda m: signing.lstrip('\n') + m.group(1),
            'android { ... } (to insert signingConfigs)')

        s = replace_once(
            s,
            r'(buildTypes\s*\{\s*\n\s*release\s*\{)',
            lambda m: m.group(1) + '\n            signingConfig signingConfigs.release',
            'buildTypes.release (to attach the signing config)')

    with open(args.gradle, 'w', encoding='utf-8') as fh:
        fh.write(s)

    print('patched %s: versionCode=%d versionName=%s signing=%s'
          % (args.gradle, args.version_code, args.version_name, 'yes' if args.sign else 'no'))


if __name__ == '__main__':
    main()
