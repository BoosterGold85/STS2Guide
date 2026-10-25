"""Package the self-contained Windows companion, not any game files."""
from pathlib import Path
import argparse
import os
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
exe = root / 'artifacts/external-win-x64/RunCoach.Desktop.exe'
if not exe.exists():
    raise SystemExit('Publish the Windows app first; see external/README.md')
files = {'RunCoach.Desktop.exe': exe, 'START-HERE.txt': root / 'external/README.md', 'licenses/DEPENDENCIES.txt': root / 'external/THIRD-PARTY.txt'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--nuget-packages', type=Path, default=Path(os.environ.get('NUGET_PACKAGES', str(Path.home() / '.nuget/packages'))))
args = parser.parse_args()
packages = args.nuget_packages
# Include the self-contained runtime licenses/attribution when packaging in this cloud.
for name, pattern in {
    'licenses/DOTNET-LICENSE.txt': 'microsoft.netcore.app.runtime.win-x64/*/LICENSE.TXT',
    'licenses/DOTNET-THIRD-PARTY.txt': 'microsoft.netcore.app.runtime.win-x64/*/THIRD-PARTY-NOTICES.TXT',
    'licenses/WINDOWS-DESKTOP-LICENSE.txt': 'microsoft.windowsdesktop.app.runtime.win-x64/*/LICENSE',
}.items():
    matches = sorted(packages.glob(pattern))
    if not matches:
        raise SystemExit(f'Runtime license missing: {pattern}; supply licenses before distributing')
    files[name] = matches[-1]
info = {'version': '0.2.0-screen-preview', 'platform': 'win-x64', 'self_contained': True,
        'requires_game_mod': False, 'automatic_map_recognition': False,
        'native_capture_ocr_validation': 'Not run; requires Windows PC',
        'verified': 'Cross-build, screen model unit tests, local HTTP service, Chromium editor tests',
        'files_sha256': {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in files.items()}}
manifest = root / 'artifacts/external-build-info.json'
manifest.write_text(json.dumps(info, indent=2) + '\n')
files['build-info.json'] = manifest
output = root / 'downloads/STS2-Run-Coach-External-0.2.0-preview.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name, path in files.items():
        archive.write(path, name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(name.endswith('.dll') for name in archive.namelist())
    for name, digest in info['files_sha256'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest
assert output.stat().st_size < 100 * 1024 * 1024, 'Exceeds GitHub file limit'
print(f'Verified standalone package: {output} ({output.stat().st_size / 1024**2:.1f} MiB)')
