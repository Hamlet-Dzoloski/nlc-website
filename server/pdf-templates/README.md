Store the NoLimitCap empty template in this folder.

Required file path:

- `server/pdf-templates/nolimitcap-empty-application.pdf`

Notes:

- `npm run create-template` creates an empty template that visually matches the renderer output.
- Backend tries template-population first; if template is not fillable, it falls back to the renderer automatically.
- If you later add a fillable AcroForm at this path, run `npm run inspect-template` to list field names.
