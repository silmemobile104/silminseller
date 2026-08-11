const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Replace fa-solid with fa-regular for all elements having sidebar-icon class
// Using a regex to match fa-solid when it's on the same line as sidebar-icon
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('sidebar-icon') && lines[i].includes('fa-solid')) {
        lines[i] = lines[i].replace(/fa-solid/g, 'fa-regular');
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Icons changed to fa-regular successfully');
