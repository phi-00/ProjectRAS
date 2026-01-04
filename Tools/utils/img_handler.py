from PIL import Image

class Img_HandlerException(Exception):
    def __init__(self, message, error_code = None):
        super().__init__(message)
        self.error_code = error_code

class Img_Handler:
    def __init__(self):
        pass

    def get_img(self, img_path:str) -> Image:
        return Image.open(img_path)
    
    def store_img(self, img: Image, img_path:str) -> None:
        # Ensure image is in RGB mode for PNG compatibility
        if img.mode in ('RGBA', 'LA', 'P'):
            # Keep alpha channel if present
            img.save(img_path, format='PNG')
        else:
            # Convert CMYK or other modes to RGB for better compatibility
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(img_path, format='PNG')
