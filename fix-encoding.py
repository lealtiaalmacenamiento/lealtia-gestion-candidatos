# -*- coding: utf-8 -*-
import os
import sys

# Mapping of incorrect UTF-8 byte sequences to correct characters
replacements = {
    b'\xc3\x83\xc2\xa1': b'\xc3\xa1',  # á
    b'\xc3\x83\xc2\xa9': b'\xc3\xa9',  # é
    b'\xc3\x83\xc2\xad': b'\xc3\xad',  # í
    b'\xc3\x83\xc2\xb3': b'\xc3\xb3',  # ó
    b'\xc3\x83\xc2\xba': b'\xc3\xba',  # ú
    b'\xc3\x83\xc2\xb1': b'\xc3\xb1',  # ñ
    b'\xc3\x83\xe2\x80\x9c': b'\xc3\x93',  # Ó
    b'\xc3\x83\xe2\x80\xa6': b'\xc3\x8d',  # Í
    b'\xc3\x83\xe2\x80\x98': b'\xc3\x91',  # Ñ
    b'\xc3\x83\xc2\x81': b'\xc3\x81',  # Á
    b'\xc3\x83\xc2\x89': b'\xc3\x89',  # É
    b'\xc3\x83\xc5\xa0': b'\xc3\x9a',  # Ú
}

files = [
    'src/app/api/polizas/route.ts',
    'src/app/(private)/pendientes/page.tsx',
    'src/app/(private)/parametros/ParametrosClient.tsx',
    'src/app/(private)/clientes/updates/page.tsx',
    'src/app/(private)/polizas/updates/page.tsx',
]

count = 0

for filepath in files:
    if not os.path.exists(filepath):
        print(f"✗ No encontrado: {filepath}")
        continue
    
    print(f"Procesando: {filepath}")
    
    with open(filepath, 'rb') as f:
        content = f.read()
    
    original = content
    
    for wrong, correct in replacements.items():
        content = content.replace(wrong, correct)
    
    if content != original:
        with open(filepath, 'wb') as f:
            f.write(content)
        print(f"  ✓ Corregido")
        count += 1
    else:
        print(f"  - Sin cambios")

print(f"\nTotal: {count} archivos corregidos")
