# 3D anatomy model: source and licence

`gallbladder-region.glb` is built from **BodyParts3D**.

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

- Source: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html (release 4.0, file `isa_BP3D_4.0_obj_99.zip`, downloaded 2026-11-14).
- Licence: Creative Commons Attribution 4.0 International, as stated in the database README (section 3, "Last updated: 2025/02/25"): https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html
- The individual mesh files inside the archive still carry an older header naming "CC Attribution-Share Alike 2.1 Japan". The README above is the database's current licence statement and is the one this project relies on. If that is ever questioned, treat the model file as share-alike.

## What was changed

The model is an adapted work. `frontend/scripts/build-anatomy-model.mjs` does the following:

- Selects 11 structures by their BodyParts3D element file IDs (listed in the script): gallbladder, cystic duct, common hepatic and bile duct, right and left hepatic ducts, hepatic arteries, portal vein, liver, stomach, duodenum, pancreas, and the skin as a body outline.
- Joins the liver's nine segment meshes into one shape and removes the walls between segments.
- Reduces the liver, pancreas and skin to fewer triangles.
- Converts millimetres to centimetres, turns the model so that up is +y and the front of the body is +z, and moves the gallbladder's centre to the origin.

## What is not from BodyParts3D

These are schematic drawings added by Surg+F, and are not anatomical data:

- The **cystic artery** (BodyParts3D has no separate mesh for it). It is a tube drawn from the nearest point on the hepatic arteries to the gallbladder.
- The four **port positions**, the **clips**, the **cut**, the yellow **triangle**, the orange **attachment marker** and the **retrieval bag** shown in the step pictures.

The model shows a generic adult body. It is not any patient's anatomy, and the step pictures have not yet been medically reviewed.
