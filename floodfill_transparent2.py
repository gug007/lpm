import sys
from collections import deque
from PIL import Image

def floodfill_remove_white(image_path, output_path, tolerance=240):
    img = Image.open(image_path).convert("RGBA")
    data = list(img.getdata())
    w, h = img.size
    
    # Simple BFS floodfill from the edges
    visited = set()
    queue = deque()
    
    # Add all edge pixels to queue
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h-1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w-1, y))
        
    # BFS
    transparent_pixels = set()
    
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
            
        visited.add((x, y))
        
        # Check if pixel is "white enough"
        idx = y * w + x
        r, g, b, a = data[idx]
        
        # If the pixel is close to white
        if r > tolerance and g > tolerance and b > tolerance:
            transparent_pixels.add((x, y))
            
            # Add neighbors
            for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if (nx, ny) not in visited:
                        queue.append((nx, ny))
                        
    # Apply transparency
    new_data = []
    for y in range(h):
        for x in range(w):
            if (x, y) in transparent_pixels:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(data[y * w + x])
                
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print("Done flood filling white from edges")

if __name__ == "__main__":
    floodfill_remove_white(sys.argv[1], sys.argv[2])
