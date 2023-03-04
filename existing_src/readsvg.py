from xml.dom.minidom import parse
import sys

document = parse(sys.argv[1])

for text in document.getElementsByTagName('text'):
    for tspan in text.childNodes:
        for child in tspan.childNodes:
            if child.nodeName == '#text':
                print(child.data)
                print('####')
            elif child.nodeName == 'tspan':
                if child.firstChild is not None:
                    print(child.firstChild.data)

