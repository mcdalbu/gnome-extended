"""Run settings integration without changing the user's terminal or config."""
import os
from pathlib import Path
import subprocess
import tempfile

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='gnome-extended-ptyxis-settings-') as config:
    subprocess.run(['gjs','-m',str(root/'tests/ptyxis-settings.js')],check=True,
                   env=dict(os.environ,GSETTINGS_BACKEND='memory',GSETTINGS_SCHEMA_DIR=str(root/'schemas'),XDG_CONFIG_HOME=config))
