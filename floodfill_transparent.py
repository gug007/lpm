import sys
from PIL import Image, ImageDraw

def floodfill_white_transparent(image_path, output_path, tolerance=10):
    img = Image.open(image_path).convert("RGBA")
    
    # We need to fill from all four corners
    w, h = img.size
    
    # Fill with a magic color first
    magic_color = (255, 0, 255, 255)
    
    # Use floodfill from the corners to replace pure white with magic color
    ImageDraw.floodfill(img, (0, 0), magic_color, thresh=tolerance)
    ImageDraw.floodfill(img, (w-1, 0), magic_color, thresh=tolerance)
    ImageDraw.floodfill(img, (0, h-1), magic_color, thresh=tolerance)
    ImageDraw.floodfill(img, (w-1, h-1), magic_color, thresh=tolerance)
    
    # Now replace magic color with transparent
    data = img.getdata()
    new_data = []
    for item in data:
        if item == magic_color:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    floodfill_white_transparent(sys.argv[1], sys.argv[2])
    print("Done")
