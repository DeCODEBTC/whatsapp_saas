import('./index.js').catch(e => {
    const fs = require('fs');
    fs.writeFileSync('error.txt', e.stack);
});
