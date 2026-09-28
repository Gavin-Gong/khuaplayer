# Khua App Icon

This directory is the canonical, editable source for the Khua app icon.
It deliberately keeps source artwork separate from the icon used by the Xcode
target.

## Files

- `KhuaPlayer.icon` is the editable Apple Icon Composer document. Its three
  active layers preserve the approved artwork's geometry, colors, gradients,
  and optical vertical alignment. The discarded blueprint experiment is not
  included.
- `KhuaPlayer-StaticMaster-1024.png` is the approved 1024 px opaque sRGB
  artwork. It contains no white rim.
- `AppIcon.appiconset` is a directly usable, traditional macOS asset catalog
  export. It is also the fallback that ships in the app.
- `export-manifest.json` records hashes and export settings for reproducibility.

Icon Composer applies its own platform shell and edge treatment in previews and
compiled output. Those system effects cannot be disabled by editing the source
layers. For that reason, the production target uses the static asset catalog:
this removes the unwanted white shell without changing the approved artwork.

## Export

The exporter requires Python 3 and the pinned Pillow version. The optional
layer-reconstruction tool also uses the pinned NumPy version. Every size is
rendered directly from the 1024 px master with Lanczos resampling; the export
is opaque RGB with a deterministic sRGB chunk.

From the directory containing this README:

```sh
python3 -m pip install -r requirements.txt
python3 export_static_appicon.py
python3 export_static_appicon.py --check
python3 check_appicon.py
```

From the public repository root, update the Xcode target after changing the
master with:

```sh
python3 Design/AppIcon/export_static_appicon.py \
  --output Apps/Mac/Resources/Assets.xcassets/AppIcon.appiconset
```

Run `prepare_icon_composer_layers.py` only when the flattened master changes and
the Icon Composer layers must be reconstructed. Normal visual edits should be
made directly in `KhuaPlayer.icon`.

Keep the editable source, static exports, and `export-manifest.json` together
when updating the icon. The Mac target consumes its asset catalog under
`Apps/Mac/Resources`; exporting and checking the artwork is a separate step
from compiling the application.
