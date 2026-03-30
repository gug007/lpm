import sys
from PIL import Image, ImageOps

def crop_and_resize(image_path, output_path, target_size=768, padding=0.02):
    # Open the image
    img = Image.open(image_path).convert("RGBA")
    
    # Get the bounding box of the non-transparent alpha channel
    # getbbox() works on the alpha channel if we split it
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    
    if not bbox:
        print("Image is entirely transparent!")
        return
        
    print(f"Original bounding box: {bbox}")
    
    # Crop the image to the bounding box
    cropped = img.crop(bbox)
    
    # Calculate target dimensions after considering padding
    # padding is a percentage of the target size (e.g., 0.1 = 10% padding on all sides, meaning the image takes up 80%)
    pad_pixels = int(target_size * padding)
    max_content_size = target_size - (pad_pixels * 2)
    
    # Resize cropped image to fit within max_content_size while maintaining aspect ratio
    w, h = cropped.size
    aspect_ratio = w / h
    
    if aspect_ratio > 1:
        new_w = max_content_size
        new_h = int(new_w / aspect_ratio)
    else:
        new_h = max_content_size
        new_w = int(new_h * aspect_ratio)
        
    resized_content = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Create a new square image with a transparent background
    final_img = Image.new("RGBA", (target_size, target_size), (255, 255, 255, 0))
    
    # Paste the resized content into the center
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    final_img.paste(resized_content, (paste_x, paste_y))
    
    # Save the final image
    final_img.save(output_path, "PNG")
    print(f"Saved optimized image to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python auto_crop.py <input> <output>")
        sys.exit(1)
    crop_and_resize(sys.argv[1], sys.argv[2])
