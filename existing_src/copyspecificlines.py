import sys

referenceLines = []
with open('bullseye_skills.txt') as f:
    for line in f:
        referenceLines.append(line.strip('\n'))

with open(sys.argv[1]) as f:
    for i, line in enumerate(f):
        if (i >= 7) and (5 <= ((i-7)%10) <= 8):
            print(referenceLines[i])
        else:
            print(line.strip('\n'))
