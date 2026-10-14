# Daybreak scoped verification

This folder records the bounded checks for the destination-only practice entry. `verification.json` identifies the tested Git head and command outcomes; text files contain the actual output. The source regression checks all 1,896 immutable source files. The five Daybreak tests include routing all 100 castables through mock source adapters, not rendered gameplay.

The browser attempt used ordinary Chromium sandboxing and a writable temporary profile. It aborted on the existing SUID sandbox-helper configuration. No `--no-sandbox`, ownership/permission change, or security bypass was used. Physical mobile and GPU rendering remain untested. No screenshot, frame-rate result, or all-castables gameplay pass is claimed.
