import os
import re
import glob

html_files = glob.glob('*.html')

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if the file has the old structure
    if 'flex-col justify-between' in content:
        # We need to replace:
        # flex-col justify-between" (or >)
        # <div class="p-6">
        #   <div class="flex items-center gap-3">
        #     <img src="logoresitrat.png" alt="Logo" class="h-12 w-auto object-contain">
        #   </div>
        #   <nav class="mt-8 space-y-1">
        
        pattern = r'(class=\"[^\"]*flex-col) justify-between(\"[^>]*>)\s*<div class=\"p-6\">\s*<div class=\"flex items-center gap-3\">\s*<img src=\"logoresitrat\.png\" alt=\"Logo\" class=\"h-12 w-auto object-contain\">\s*</div>\s*<nav class=\"mt-8 space-y-1\">'
        
        replacement = r'\1 h-full\2\n      <div class="p-6 pb-0">\n        <div class="flex items-center gap-3">\n          <img src="logoresitrat.png" alt="Logo" class="h-12 w-auto object-contain">\n        </div>\n      </div>\n      <div class="flex-1 overflow-y-auto px-6 py-4">\n        <nav class="space-y-1">'
        
        new_content, count = re.subn(pattern, replacement, content)
        
        if count > 0:
            print(f'Updated {file}')
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
        else:
            print(f'Could not match pattern in {file}')

