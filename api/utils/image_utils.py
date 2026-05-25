from PIL import Image
from .responses import success, error
import os
import uuid






def validate_img(img, extensions_allowed):

    max_file_size = 5*1024*1024
    img.seek(0, os.SEEK_END)
    file_size = img.tell()
    if file_size > max_file_size:
        return error(code="INVALID_DATA", message="max file size is 5mb.")

    img.seek(0)
    try:
        image = Image.open(img)
        if image.format not in extensions_allowed:
            return error(code="INVALID_DATA", message="file must be jpeg, png or gif.")
        image.verify()
    except Exception:
        return error(code="INVALID_DATA", message="invalid image.")
    img.seek(0)

def save_img_upload(img, extensions_allowed):
    is_not_valid = validate_img(img, extensions_allowed)
    if is_not_valid:
        return "error", is_not_valid
        
    image = Image.open(img)
    image_extension = image.format.lower()
    if image_extension == "jpeg":
        image_extension = "jpg"
    image_name = f'{uuid.uuid4()}.{image_extension}'
    image_path = os.path.join("static", "uploads", image_name)
    if image_extension == "gif":
        img.save(image_path)
    else:
        image.save(image_path)
    return "success", image_path
    
