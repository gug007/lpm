import sys
from PIL import Image

def remove_white_and_crop(image_path, output_path, target_size=768, padding=0.02):
    img = Image.open(image_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    # Remove anything that is white or near-white (the frame)
    # The frame looks white/light gray. The arrows are dark gray. The dots are colored.
    for item in data:
        r, g, b, a = item
        # If the pixel is very bright (close to white), make it transparent
        if r > 200 and g > 200 and b > 200:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    
    # Now get the bounding box of the remaining non-transparent pixels
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    
    if not bbox:
        print("Image is entirely transparent after removing white!")
        # fallback to save what we have
        img.save(output_path, "PNG")
        return
        
    print(f"Bounding box after removing white: {bbox}")
    
    # Crop the image to the bounding box
    cropped = img.crop(bbox)
    
    # Calculate target dimensions after considering padding
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
        print("Usage: python script.py <input> <output>")
        sys.exit(1)
    remove_white_and_crop(sys.argv[1], sys.argv[2])
