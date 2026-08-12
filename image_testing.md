# Image handling rules (LLM vision extraction)
- Accepted MIME for LLM: image/jpeg, image/png, image/webp only.
- Backend resizes uploads to max 1600px PNG before base64 (resize_b64_png).
- Purchase PDFs rendered to PNG pages via PyMuPDF (pdf_to_images_b64), max 3 pages.
- Do not send blank/solid images.
- Endpoints: POST /api/sales/scan (image, handwritten bill), POST /api/purchases/scan (pdf or image).
