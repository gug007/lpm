import sys
from PIL import Image, ImageDraw

def make_white_transparent(image_path, output_path, tolerance=250):
    img = Image.open(image_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        # Check if the pixel is near-white (background)
        if item[0] >= tolerance and item[1] >= tolerance and item[2] >= tolerance:
            new_data.append((255, 255, 255, 0))  # fully transparent
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    make_white_transparent(sys.argv[1], sys.argv[2])
    print("Done")
