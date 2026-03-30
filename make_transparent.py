import sys
from PIL import Image, ImageDraw

def add_rounded_corners(image_path, output_path, radius):
    img = Image.open(image_path).convert("RGBA")
    
    # Create a mask with rounded corners
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, img.size[0], img.size[1]), radius=radius, fill=255)
    
    # Apply the mask
    img.putalpha(mask)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python script.py <input> <output>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    # For a 768x768 image, standard macOS radius is roughly 135px
    add_rounded_corners(input_file, output_file, radius=135)
    print(f"Saved to {output_file}")
