"""Package our compiled mod/dashboard only; never redistribute game references."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--references', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    artifacts = root / 'artifacts'
    output = artifacts / 'RunCoach.ReadOnly'
    manifest = root / 'bridge/RunCoach.ReadOnly/RunCoach.ReadOnly.json'
    (output / manifest.name).write_bytes(manifest.read_bytes())
    files = {f'mods/{p.name}': p for p in (output / 'RunCoach.ReadOnly.dll', manifest)}
    files['INSTALL-FIRST.txt'] = root / 'docs/INSTALL-FIRST.txt'
    files['THIRD_PARTY.txt'] = root / 'bridge/THIRD_PARTY.md'
    files['SAVE-PROFILES.txt'] = root / 'docs/save-profiles.md'
    shortcut = artifacts / 'Run Coach.url'
    shortcut.write_text('[InternetShortcut]\nURL=http://127.0.0.1:15527/coach\n')
    files[shortcut.name] = shortcut
    info = {'build': '0.1.0-preview', 'sdk': '9.0.319',
            'game_reported': 'v0.107.1 (2026.06.18)',
            'expected_game_mvid': '97f10687-c306-4798-ab75-8b9f23f34dfb',
            'game_build': 'compiled, zero warnings/errors',
            'live_validation': 'Earlier bridge SP observations verified by user; new map capture needs live validation; co-op advice disabled',
            'game_references_sha256': {name: hashlib.sha256((args.references / name).read_bytes()).hexdigest()
                                       for name in ('sts2.dll', 'GodotSharp.dll')},
            'files_sha256': {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in files.items()}}
    info_path = artifacts / 'build-info.json'
    info_path.write_text(json.dumps(info, indent=2) + '\n')
    files[info_path.name] = info_path
    target = artifacts / 'STS2-Run-Coach-0.1.0-preview.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, path in files.items():
            archive.write(path, name)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert {n for n in archive.namelist() if n.endswith('.dll')} == {'mods/RunCoach.ReadOnly.dll'}
        for name, checksum in info['files_sha256'].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == checksum
    print(f'Verified package: {target} ({target.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
