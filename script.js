async function main()
{
    // the whole thing has to be in an asynchronous function so that I have access to it
    // slick trick: use the window html path filename to get the lower case, no "the" name to build the skills txt file name
    lowerCaseCharacterName = /.*\/(.*?)\.html/.exec(window.location.pathname)[1];
    response = await fetch(lowerCaseCharacterName + '_skills.txt', {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    data = (await response.text()).replace(/\r\n/g, '\n');

    rm_response = await fetch('rollmodifiers.txt');
    rm_data = await rm_response.text();

    // load the text file
    // it consists of 367 lines:
    // lines 0-6 are character name, base class, and 4 subclass names, left to right, and record separator RS = ####
    // there are then 36 (skills) x 10 lines each, including the RS on the last line where the SKILLDATA is pushed + descriptions reset (mutable)
    // you can figure out where in that 10 lines you are by: subtracting 7 (for the first 7 lines) then mod 10
    // lines 0-3 are 4 lines of description text. They must be empty if they are to be empty; SVGs don't do line breaking or wrapping
    // line 4 is the upper case skill name (locked skills are specially handled when the label text is made)
    // line 5 is the unique skill identifier; first number is "level" (how many steps away); this is used throughout as "name" to access objects
    // lines 6-8 work together to position the label
    // line 6 is a number 0-7 specifying the number of multiples of pi/4 to rotate around clockwise, as a position, e.g. 2 is "down", 5 is "up left"
    // line 7-8 is horizontal and vertical align: ha = start middle end, va = auto middle hanging
    var CHARACTER_NAME = '';
    var BASECLASS = '';
    var SUBCLASSES = [];

    var DESCRIPTION_TEXTS = [];
    var SKILLNAME = '';
    var SKILLTAG = '';
    var SKILLLABELPOS = 0;
    var SKILLHA = '';
    var SKILLVA = '';

    var SKILLDATA = {};

    data.split('\n').forEach((line, index) => {
        if      (index == 0) { CHARACTER_NAME = line; }
        else if (index == 1) { BASECLASS = line; }
        else if (index <= 5) { SUBCLASSES.push(line); } 

        else if ( (index-7)%10 == 0 ) { DESCRIPTION_TEXTS.push(line); }
        else if ( (index-7)%10 == 1 ) { DESCRIPTION_TEXTS.push(line); }
        else if ( (index-7)%10 == 2 ) { DESCRIPTION_TEXTS.push(line); }
        else if ( (index-7)%10 == 3 ) { DESCRIPTION_TEXTS.push(line); }
        else if ( (index-7)%10 == 4 ) { SKILLNAME = line; }
        else if ( (index-7)%10 == 5 ) { SKILLTAG = line; }
        else if ( (index-7)%10 == 6 ) { SKILLLABELPOS = parseInt(line); }
        else if ( (index-7)%10 == 7 ) { SKILLHA = line; }
        else if ( (index-7)%10 == 8 ) { SKILLVA = line; }
        else if ( (index-7)%10 == 9 ) {
            SKILLDATA[SKILLTAG] = {
                'description_texts':DESCRIPTION_TEXTS,
                'skill_name':SKILLNAME,
                'skill_label_pos':SKILLLABELPOS,
                'ha':SKILLHA,
                'va':SKILLVA,
            };
            DESCRIPTION_TEXTS = [];
        }
    });

    // load the roll modifiers
    // it's just lines of 3 fields: lower case character name, 2 letter stat abbrev, and value
    // only copy in the relevant values
    var ROLL_NAMES = ['STR', 'END', 'PER', 'AGL'];
    var ROLL_DATA = {}

    rm_data.split('\n').forEach((line, index) => {
        fields = line.split(/\s+/); // split on multiple spaces
        if (fields[0] == lowerCaseCharacterName)
        {
            ROLL_DATA[fields[1]] = {'value':fields[2]};
        }
    })


    // begin the SVG file in earnest

    var SVGNS = 'http://www.w3.org/2000/svg';
    var XLINKNS = 'http://www.w3.org/1999/xlink';
    var WIDTH = 320 + 40;
    var HEIGHT = 180;
    var PXPERMM = 3.7;

    svgContainerDiv = document.createElement('div');
    svgContainerDiv.className = 'svgcontainerdiv';
    document.body.appendChild(svgContainerDiv);

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('style', 'border: 0px solid black; padding-top: 10px');
    svg.setAttribute('viewBox', '0 0 ' + (WIDTH * PXPERMM).toString() + ' ' + (HEIGHT * PXPERMM).toString());
    svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svgContainerDiv.appendChild(svg);

    // defs for adding masks (the lines shouldn't be visible)
    var defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);

    // background
    var image = document.createElementNS(SVGNS, 'image');
    image.setAttributeNS(null, 'x', 0);
    image.setAttributeNS(null, 'y', 0);
    image.setAttributeNS(null, 'width' , '100%');
    image.setAttributeNS(null, 'height', '100%');
    image.setAttributeNS(null, 'href', 'bg.jpg');
    image.setAttributeNS(null, 'preserveAspectRatio', 'none');
    svg.appendChild(image);

    // globals
    var STROKE_WIDTH = 3;
    var RADII = {'large':14, 'medium':9, 'small':7};

    // emulating classes by keying dictionaries lol
    var GROUPS = {};
    var CENTERS = {};
    var TEXTS = {};
    var DGROUPS = {};
    var STATES = {};

    // these don't need names; draw them and be done
    var LINES = [];

    // state functions for which skills are on and off
    // state is saved as 9 hexadecimal (4 bits) = 36 skills' on-off values
    // you see I started with a digit array, since you can't actually work with 2^36 in JS
    // so it is displayed left to right. As long as you stay consistent, it won't matter
    // sort each time for consistency; get the bit number 0-3 and which hexdigit 0-8; multiply by the bit shift mask
    // turn them into hex and join
    // the opposite function takes the input, loops through the characters, parses base16, bitwise ands to get the new state,
    // figures out which name (in sortedKeys) to change, and changes state; THEN you must call groupHover and groupExit, as if you had moused over.
    
    function getStateCode()
    {
        sortedKeys = Object.keys(STATES).sort();
        digits = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        sortedKeys.forEach( (key, index) => {
            bitNumber = index%4;
            digitNumber = Math.floor(index/4);
            digits[digitNumber] += ( STATES[key] * (1 << bitNumber) );
        })
        hexes = digits.map(x => x.toString(16).toUpperCase());
        return hexes.join('');
    }

    function setStatesFromCode(code)
    {
        sortedKeys = Object.keys(STATES).sort();
        // limit the number of characters parsed to 9; maxLength also enforces
        for (digitNumber=0; digitNumber<Math.min(code.length,9); digitNumber++)
        {
            chr = code[digitNumber];
            digitValue = parseInt(chr, 16);
            for (bitNumber = 0; bitNumber < 4; bitNumber++)
            {
                newState = ((1 << bitNumber) & digitValue);
                index = digitNumber*4 + bitNumber;
                name = sortedKeys[index];
                if (newState) { turnOn(name) } else { turnOff(name) };
                groupHover(name);
                groupExit(name);
            }
        }
    }
    
    // download strings describing the current state of each character
    // it's a json where the keys are the character name and the values are the code that you should put into setStatesFromCode()
    
    const STORAGE_URL = "http://132.145.169.145/api/core-skill-tree/"
    
    // Helper function to timeout the fetch request
    async function fetchWithTimeout(url, options = {}, timeout = 1000) {
        const controller = new AbortController(); // Create an AbortController to cancel the request
        const signal = controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), timeout); // Set up the timeout

        try {
            const response = await fetch(url, { ...options, signal });
            clearTimeout(timeoutId); // Clear the timeout if the fetch completes successfully
            return response;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw err; // Re-throw other errors
        }
    }
    
    async function fetchCodes() {
        try {
            const response = await fetchWithTimeout(STORAGE_URL, {
                method: 'GET'
            });
            const result = await response.json();
            return result
        } catch (error) {
            console.error('Error loading data:', error);
            return { notes: {} };
        }
    }
    
    // name is lowerCaseCharacterName, code is string
    async function storeCodes(name, code) {
        try {
            data = {[name]: code};
            const response = await fetchWithTimeout(STORAGE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            }); 
            if (response.ok==200) {alert("Value saved!")}
            else {alert("Failed to save...")}
            return response.ok;
        } catch(error) {
            console.error('Error saving data:', error);
            return false;
        }
    }
        
    // more or less self explanatory text boilerplate

    function makeText(x, y, text, ha='start', va='auto')
    {
        var textObj = document.createElementNS(SVGNS, 'text');
        textObj.setAttributeNS(null, 'x', x);
        textObj.setAttributeNS(null, 'y', y);
        textObj.setAttributeNS(null, 'text-anchor', ha);
        textObj.setAttributeNS(null, 'dominant-baseline', va);
        var textNode = document.createTextNode(text);
        textObj.appendChild(textNode);
        return textObj;
    }

    // all the interactive hover mouse stuff along with the states

    function turnOn (name) {STATES[name] = 1;}
    function turnOff(name) {STATES[name] = 0;}
    function isOn   (name) {return STATES[name] == 1;}
    function isOff  (name) {return STATES[name] == 0;}
    function groupClick(name)
    {
        if (isOff(name)) {turnOn(name)} else {turnOff(name)};
        ss_input.value = getStateCode();
    }
    function groupHover(name)
    {
        circle = GROUPS[name].children[0]
        text = TEXTS[name];
        desc = DGROUPS[name];
        circle.style.opacity = 1;
        circle.style.fill = '#FF0000';
        text.style.fill = 'red';
        desc.style.opacity = 1;
    }
    function groupExit(name)
    {
        circle = GROUPS[name].children[0]
        text = TEXTS[name];
        desc = DGROUPS[name];
        circle.style.fill = '#000000';
        text.style.fill = 'black';
        desc.style.opacity = 0;
        if (isOff(name)) {circle.style.opacity = 0};
    }

    // skill button: inner fill, outer border, label text, population of groups, texts, states, etc.
    function skillButton(name, cx, cy, size)
    {
        var OUTERR = RADII[size];
        var INNERR = OUTERR * .6 + (OUTERR-RADII['small'])*.25; // 60% + a little, more the bigger it is

        var group = document.createElementNS(SVGNS, 'g');
        group.setAttributeNS(null, 'id', name);

        var circle = document.createElementNS(SVGNS, 'circle');
        circle.setAttributeNS(null, 'cx'   , cx*PXPERMM);
        circle.setAttributeNS(null, 'cy'   , cy*PXPERMM);
        circle.setAttributeNS(null, 'r'    , INNERR);
        circle.setAttributeNS(null, 'fill' , '#000000');
        circle.style.opacity = 0;
        group.appendChild(circle);

        var border = document.createElementNS(SVGNS, 'circle');
        border.setAttributeNS(null, 'cx'            , cx*PXPERMM);
        border.setAttributeNS(null, 'cy'            , cy*PXPERMM);
        border.setAttributeNS(null, 'r'             , OUTERR);
        border.setAttributeNS(null, 'fill'          , 'none');
        border.setAttributeNS(null, 'stroke'        , '#000000');
        border.setAttributeNS(null, 'stroke-width'  , STROKE_WIDTH);
        border.setAttributeNS(null, 'pointer-events', 'all'); // so that even the "interior" of the border can take pointer events!
        group.appendChild(border);

        // only two major things to note here
        // first, the "radius" is 1.5 * OUTERRADIUS, then multiplying by cos(x) and sin(x)
        // BUT because the Y axis points downwards, 1 * PI/4 corresponds to -PI/4 in "real math" world, 3 * PI/4 = -3/4 PI/4, etc.
        // other thing to note is the final guard against printing "LOCKED SKILL" on the labels -- it's in the description, not in the label
        angle = Math.PI/4*SKILLDATA[name]['skill_label_pos'];
        cxTextDelta = OUTERR * 1.5 * Math.cos(angle);
        cyTextDelta = OUTERR * 1.5 * Math.sin(angle);
        labelText = SKILLDATA[name]['skill_name'].toLowerCase();
        if (labelText == 'locked skill') {labelText = '?'; }
        var text = makeText(
            cx*PXPERMM + cxTextDelta,
            cy*PXPERMM + cyTextDelta,
            labelText,
            ha=SKILLDATA[name]['ha'],
            va=SKILLDATA[name]['va']
        );
        text.setAttributeNS(null, 'class', 'label');

        GROUPS[name] = group;
        CENTERS[name] = [cx*PXPERMM, cy*PXPERMM];
        STATES[name] = 0
        TEXTS[name] = text;

        group.addEventListener('click'     , function(){groupClick(name);});
        group.addEventListener('mouseenter', function(){groupHover(name);});
        group.addEventListener('mouseout'  , function(){groupExit (name);});

    }

    // abstract away the top-left / inverted-y coordinate system
    function RPosSkillButton(name, x, y, size)
    {
        skillButton(name, WIDTH/2 + x, HEIGHT - y - 20, size);
    }

    // the tree is symmetric so encapsulate symmetric pairs; BUT the indices (1-2, 1-3, etc.) need to be specified
    // indices below are usually given in reverse order since thie function does +x (the RIGHT side) first
    function RPosSkillButtonPair(name, indices, x, y, size)
    {
        RPosSkillButton(name + indices[0].toString(),  x, y, size);
        RPosSkillButton(name + indices[1].toString(), -x, y, size);
    }

    // encapsulate each "diamond", starting with the bottom; still need PAIRS of indices
    // and then, because the "corners" are two more pairs, two more sets of indices
    function RPosSkillDiamond(indices, cindices1, cindices2, x, y)
    {
        RPosSkillButtonPair('4-', indices  , x      , y      , 'medium');
        RPosSkillButtonPair('5-', cindices1, x - 20 , y + 17 , 'medium');
        RPosSkillButtonPair('5-', cindices2, x + 20 , y + 17 , 'medium');
        RPosSkillButtonPair('6-', indices  , x      , y + 35 , 'large' );
    }

    RPosSkillButton    ('0-0',           0,   0, 'large' );

    RPosSkillButtonPair('1-' , [2, 1],  20,  20, 'small' );
    RPosSkillButtonPair('2-' , [2, 1],  20+1,  40, 'small' );

    RPosSkillButtonPair('3-' , [7, 1],  80,  25, 'medium');
    RPosSkillButtonPair('3-' , [6, 2],  70,  50, 'medium');
    RPosSkillButtonPair('3-' , [5, 3],  40,  70, 'medium');
    RPosSkillButton    ('3-4',           0,  80, 'medium');

    RPosSkillDiamond([6, 1], [11, 2], [12, 1], 130,  40);
    RPosSkillDiamond([5, 2], [ 9, 4], [10, 3], 115,  90);
    RPosSkillDiamond([4, 3], [ 7, 6], [ 8, 5],  40-1, 110);

    // draw line between two skill tags e.g. '1-1' to '2-1'
    // this requires GROUPS and CENTERS to be populated, which is why the skill buttons are above (but NOT added to SVG yet, so they can go on top!)
    // now define the MASK. start with fully white rectangle and add specific black circles
    // centers are already saved and we just need the outer radius, which is the SECOND child (border)'s radius value
    // name it so that it can be url referenced later
    function lineBetween(g1, g2)
    {
        var line = document.createElementNS(SVGNS, 'line');
        line.setAttributeNS(null, 'x1', CENTERS[g1][0]);
        line.setAttributeNS(null, 'y1', CENTERS[g1][1]);
        line.setAttributeNS(null, 'x2', CENTERS[g2][0]);
        line.setAttributeNS(null, 'y2', CENTERS[g2][1]);
        line.setAttributeNS(null, 'stroke', 'black');
        line.setAttributeNS(null, 'stroke-width', STROKE_WIDTH);

        // sure wish this was all more slick looking
        var clippath = document.createElementNS(SVGNS, 'mask');
        clippath.setAttributeNS(null, 'id' , 'clip-' + g1 + '-' + g2);

            var clippathinner0 = document.createElementNS(SVGNS, 'rect');
            clippathinner0.setAttributeNS(null, 'x'     , 0);
            clippathinner0.setAttributeNS(null, 'y'     , 0);
            clippathinner0.setAttributeNS(null, 'width' , WIDTH*PXPERMM);
            clippathinner0.setAttributeNS(null, 'height', HEIGHT*PXPERMM);
            clippathinner0.setAttributeNS(null, 'fill'  , '#FFFFFF');
            clippath.appendChild(clippathinner0);

            var clippathinner1 = document.createElementNS(SVGNS, 'circle');
            clippathinner1.setAttributeNS(null, 'cx'   , CENTERS[g1][0]);
            clippathinner1.setAttributeNS(null, 'cy'   , CENTERS[g1][1]);
            clippathinner1.setAttributeNS(null, 'r'    , GROUPS[g1].children[1].r.baseVal.value); // it's the same size as the outer radius!
            clippathinner1.setAttributeNS(null, 'fill' , '#000000');
            clippath.appendChild(clippathinner1);

            var clippathinner2 = document.createElementNS(SVGNS, 'circle');
            clippathinner2.setAttributeNS(null, 'cx'   , CENTERS[g2][0]);
            clippathinner2.setAttributeNS(null, 'cy'   , CENTERS[g2][1]);
            clippathinner2.setAttributeNS(null, 'r'    , GROUPS[g2].children[1].r.baseVal.value); // it's the same size as the outer radius!
            clippathinner2.setAttributeNS(null, 'fill' , '#000000');
            clippath.appendChild(clippathinner2);
            defs.appendChild(clippath);

            line.setAttributeNS(null, 'mask', 'url(#' + clippath.id + ')');
        LINES.push(line);
    }

    // description text box (it turns on with hover over buttons, etc.)
    // first make a box, half opacity, beige; find its location and width once and be done
    // second, make the title; a couple mm offset was good
    // NOW, you must add it to the SVG, or it will not render, and you cannot get how long the line should be!
    // then the underline, 6mm below the top left of title text
    // finally the 4 lines of description text, 3mm below that, and then every 5mm
    // initialize all opacities to 0

    function description(name)
    {
        var dgroup = document.createElementNS(SVGNS, 'g');
        dgroup.setAttributeNS(null, 'id', 'd'+name);
        //dgroup.setAttributeNS(null, 'opacity', 0);
        
        topLeftX   = (WIDTH/2 + 35)*PXPERMM;
        topLeftY   = (HEIGHT  - 36)*PXPERMM;
        rectWidth  = 140           *PXPERMM;
        rectHeight = 33            *PXPERMM;

        var rect = document.createElementNS(SVGNS, 'rect');
        rect.setAttributeNS(null, 'x'             , topLeftX  )
        rect.setAttributeNS(null, 'y'             , topLeftY  )
        rect.setAttributeNS(null, 'width'         , rectWidth )
        rect.setAttributeNS(null, 'height'        , rectHeight)
        rect.setAttributeNS(null, 'fill'          , 'beige');
        rect.setAttributeNS(null, 'fill-opacity'  , .5);
        rect.setAttributeNS(null, 'stroke'        , '#000000');
        rect.setAttributeNS(null, 'stroke-width'  , STROKE_WIDTH);
        dgroup.appendChild(rect);

        textX = topLeftX + 2*PXPERMM;
        titleY = topLeftY + 2*PXPERMM;
        var txt = makeText(textX, titleY, SKILLDATA[name]['skill_name'], ha='start', va='hanging');
        txt.setAttributeNS(null, 'class', 'skilltitle');
        dgroup.appendChild(txt);

        // you must do this!
        svg.appendChild(dgroup);

        // or this will not work!
        titleWidth = txt.getComputedTextLength();

        lineY = titleY + 6*PXPERMM;
        var underline = document.createElementNS(SVGNS, 'line');
        underline.setAttributeNS(null, 'x1', textX);
        underline.setAttributeNS(null, 'y1', lineY);
        underline.setAttributeNS(null, 'x2', textX + titleWidth);
        underline.setAttributeNS(null, 'y2', lineY);
        underline.setAttributeNS(null, 'stroke', 'black');
        underline.setAttributeNS(null, 'stroke-width', 2);
        dgroup.appendChild(underline);


        paraY = lineY + 3*PXPERMM;
        var txt = makeText(textX, paraY, SKILLDATA[name]['description_texts'][0], ha='start', va='hanging');
        txt.setAttributeNS(null, 'class', 'skillpara');
        dgroup.appendChild(txt);

        paraY = lineY + 3*PXPERMM + 5*PXPERMM;
        var txt = makeText(textX, paraY, SKILLDATA[name]['description_texts'][1], ha='start', va='hanging');
        txt.setAttributeNS(null, 'class', 'skillpara');
        dgroup.appendChild(txt);

        paraY = lineY + 3*PXPERMM + 10*PXPERMM;
        var txt = makeText(textX, paraY, SKILLDATA[name]['description_texts'][2], ha='start', va='hanging');
        txt.setAttributeNS(null, 'class', 'skillpara');
        dgroup.appendChild(txt);

        paraY = lineY + 3*PXPERMM + 15*PXPERMM;
        var txt = makeText(textX, paraY, SKILLDATA[name]['description_texts'][3], ha='start', va='hanging');
        txt.setAttributeNS(null, 'class', 'skillpara');
        dgroup.appendChild(txt);

        dgroup.style.opacity = 0;

        DGROUPS[name] = dgroup;

    }

    // the "main" character text + S2, built off makeText and classes
    function mainText(x, y, characterName)
    {
        txt1 = makeText(x, y     , characterName + ': SKILL TREE', ha='middle');
        txt1.setAttributeNS(null, 'class', 'capename');
        svg.appendChild(txt1);
        txt2 = makeText(x, y + 25, 'CORE SEASON 2', ha='middle');
        txt2.setAttributeNS(null, 'class', 'capeseason');
        svg.appendChild(txt2);
    }

    // the "subclass/baseclass" texts, built off makeText and classes
    function capeClassText(x, y, className, classType)
    {
        txt1 = makeText(x, y     , className, ha='middle');
        txt1.setAttributeNS(null, 'class', 'capeclass');
        svg.appendChild(txt1);
        txt2 = makeText(x, y + 25, classType, ha='middle');
        txt2.setAttributeNS(null, 'class', 'capetype');
        svg.appendChild(txt2);
    }


    // these are the first non-parameter, non-def declarative lines (after the skill button stuff above)
    // make and add the lines, though not added to SVG yet
    // these are organized in a relatively useful way given the new naming convention
    [
        ['0-0', '1-1'],
        ['0-0', '1-2'],

        ['1-1', '2-1'],
        ['1-2', '2-2'],

        ['2-1', '3-1'],
        ['2-1', '3-2'],
        ['2-1', '3-3'],
        ['2-1', '3-4'],

        ['2-2', '3-4'],
        ['2-2', '3-5'],
        ['2-2', '3-6'],
        ['2-2', '3-7'],

        ['3-1', '4-1'],
        ['3-2', '4-1'],
        ['3-2', '4-2'],
        ['3-3', '4-2'],
        ['3-3', '4-3'],
        ['3-4', '4-3'],
        ['3-4', '4-4'],
        ['3-5', '4-4'],
        ['3-5', '4-5'],
        ['3-6', '4-5'],
        ['3-6', '4-6'],
        ['3-7', '4-6'],

        ['4-1', '5-1' ],
        ['4-1', '5-2' ],
        ['4-2', '5-3' ],
        ['4-2', '5-4' ],
        ['4-3', '5-5' ],
        ['4-3', '5-6' ],
        ['4-4', '5-7' ],
        ['4-4', '5-8' ],
        ['4-5', '5-9' ],
        ['4-5', '5-10'],
        ['4-6', '5-11'],
        ['4-6', '5-12'],

        ['5-1' , '6-1'],
        ['5-2' , '6-1'],
        ['5-3' , '6-2'],
        ['5-4' , '6-2'],
        ['5-5' , '6-3'],
        ['5-6' , '6-3'],
        ['5-7' , '6-4'],
        ['5-8' , '6-4'],
        ['5-9' , '6-5'],
        ['5-10', '6-5'],
        ['5-11', '6-6'],
        ['5-12', '6-6'],

    ].forEach(pair => {
        g1 = pair[0];
        g2 = pair[1];
        lineBetween(g1, g2);
    })

    // draw everything in order now by adding to the svg

    // draw all the lines first, including their clipping masks
    // no real need to loop again, but it separates
    LINES.forEach(line => svg.appendChild(line));

    // loop over all key value pairs in dictionary groups to add them on top
    for (let [name, group] of Object.entries(GROUPS))
    {
        svg.appendChild(group);
        svg.appendChild(TEXTS[name]);
        description(name);
    }

    // draw all the floating texts
    mainText(80*PXPERMM, (HEIGHT-20)*PXPERMM, CHARACTER_NAME);
    capeClassText((WIDTH/2      )*PXPERMM,  30, BASECLASS     , 'BASE'    );
    capeClassText((WIDTH/2 - 155)*PXPERMM, 260, SUBCLASSES[0] , 'SUBCLASS');
    capeClassText((WIDTH/2 - 115)*PXPERMM,  55, SUBCLASSES[1] , 'SUBCLASS');
    capeClassText((WIDTH/2 + 115)*PXPERMM,  55, SUBCLASSES[2] , 'SUBCLASS');
    capeClassText((WIDTH/2 + 155)*PXPERMM, 260, SUBCLASSES[3] , 'SUBCLASS');

    // row blocks
    // defining common row functions which create row elements: H2, input, and button
    // they now use the same base CSS classes, only modifying when necessary

    function addRowH2(text, subdiv) {
        elm = document.createElement('h2');
        elm.className = 'ib elempadding';
        elm.innerHTML = text;
        subdiv.appendChild(elm);
        return elm;
    }

    function addRowInput(value, maxLength, subdiv) {
        elm = document.createElement('input');
        elm.type = 'text';
        elm.value = value;
        elm.maxLength = maxLength;
        elm.className = 'ib elempadding inputcommon';
        subdiv.appendChild(elm);
        return elm;
    }

    function addRowButton(text, subdiv) {
        elm = document.createElement('button');
        elm.className = 'buttoncommon';
        elm.innerHTML = text;
        subdiv.appendChild(elm);
        return elm;
    }

    // Make sure the default codes are stored in sessionStorage
    // If they aren't download them and store them there
    // Then "download" the code from sessionStorage to store
    
    if (sessionStorage.getItem(lowerCaseCharacterName+'Code') == null) {
        try {
            let codeList = await fetchCodes();
            for (const [key, value] of Object.entries(codeList)) {
                sessionStorage.setItem(key+'Code', value);
            }
        } catch {
            console.error("Couldn't transfer data to localStorage:", error);
        }
    }
    
    let defaultCode;
    if (sessionStorage.getItem(lowerCaseCharacterName+'Code') != null) {
        defaultCode = sessionStorage.getItem(lowerCaseCharacterName+'Code');
        setStatesFromCode(defaultCode);
    } else {
        defaultCode = "000000000";
    }

    // state row
    // first, outer which defines the overall width and clears floats
    // second, inner which has margin auto to stretch within the div
    // then add any elements to the inner div

    div = document.createElement('div');
    div.className = 'stateouter row';
    document.body.appendChild(div);
    subdiv = document.createElement('div');
    subdiv.className = 'innerstretch';
    div.appendChild(subdiv);

    rscol1 = document.createElement('div');
    rscol1.className = 'ib rscolstate';
    subdiv.appendChild(rscol1);
    rscol2 = document.createElement('div');
    rscol2.className = 'ib rscolstate';
    subdiv.appendChild(rscol2);
    rscol3 = document.createElement('div');
    rscol3.className = 'ib rscolstate';
    subdiv.appendChild(rscol3);
    rscol4 = document.createElement('div');
    rscol4.className = 'ib rscolstate';
    subdiv.appendChild(rscol4);

    addRowH2('Save State:', rscol1);
    ss_input = addRowInput(defaultCode, '9', rscol2);
    ss_input.classList.add('stateinput');
    ss_button1 = addRowButton('Set State', rscol3);
    ss_button1.addEventListener('click', function(){setStatesFromCode(ss_input.value)});
    ss_button2 = addRowButton('Save State', rscol4);
    confirmationDialogue = "Are you sure you want to set a new default value?\n\nThis will /permanently/ overwrite the old value.";
    ss_button2.addEventListener('click', async function(event) {
        if (confirm(confirmationDialogue)) {
            let newCode = ss_input.value;
            sessionStorage.setItem(lowerCaseCharacterName+'Code', newCode);
            await storeCodes(lowerCaseCharacterName, newCode);
        }
    });

    // roll row
    // first, outer which defines the overall width and clears floats
    // second, inner which has margin auto to stretch within the div
    // then add any elements to the inner div

    div = document.createElement('div');
    div.className = 'rollouter row';
    document.body.appendChild(div);
    subdiv = document.createElement('div');
    subdiv.classname = 'innerstretch';
    div.appendChild(subdiv);

    rscol1 = document.createElement('div');
    rscol1.className = 'ib rscolroll';
    subdiv.appendChild(rscol1);
    rscol2 = document.createElement('div');
    rscol2.className = 'ib rscolroll';
    subdiv.appendChild(rscol2);
    rscol3 = document.createElement('div');
    rscol3.className = 'ib rscolroll';
    subdiv.appendChild(rscol3);
    rscol4 = document.createElement('div');
    rscol4.className = 'ib rscolroll';
    subdiv.appendChild(rscol4);

    addRowH2('Stat Presets:', rscol1);

    // defined way up top in an array for order purposes
    // make a button for each statistic; define the callback later
    ROLL_NAMES.forEach(name => {
        roll_button = addRowButton(name, rscol2);
        ROLL_DATA[name]['button'] = roll_button;
    })

    addRowH2('1d10', rscol3);
    addRowH2('+', rscol3);

    roll_add = addRowInput('0', '3', rscol3);
    roll_add.classList.add('rollinput');

    // I don't fully understand this next part, except I think it has to do with async functions and variables
    // the callback function takes the value of the button as its input, bypassing indices and etc
    // then it looks up the relevant modifier and sets the value accordingly
    function setRollInputValue(key)
    {
        roll_add.value = ROLL_DATA[key]['value'].toString();
    }

    for (let [key, data] of Object.entries(ROLL_DATA))
    {
        data['button'].addEventListener('click', function(){setRollInputValue(this.innerHTML);});
    }

    roll_button = addRowButton('Roll', rscol3);

    // the results: the d10 roll, +, the modifier, =, and the result
    roll_res10    = addRowH2('0', rscol4); roll_res10  .classList.add('rolltextfixed');
    roll_res_plus = addRowH2('+', rscol4);
    roll_res_add  = addRowH2('0', rscol4); roll_res_add.classList.add('rolltextfixed');
    roll_res_plus = addRowH2('=', rscol4);
    roll_result   = addRowH2('0', rscol4); roll_result .classList.add('rolltextfixed');

    // now we can define the dice roll; floor(rand() * N) + 1 will do it.
    // get whatever the final value of the modifier input is; set the modifier result indicator to it;
    // then compute the result; add it to the string
    function diceRoll(N)
    {
        diceValue = Math.floor(Math.random() * N) + 1;
        roll_res10.innerHTML = diceValue.toString();
        addValue = parseInt(roll_add.value);
        roll_res_add.innerHTML = roll_add.value;
        result = diceValue + addValue;
        roll_result.innerHTML = result.toString();
    }
    roll_button.addEventListener('click', function(){diceRoll(10)});
}
main();
