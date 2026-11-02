function sameDocument(actual,expected){try{const a=new URL(actual),b=new URL(expected);a.hash='';b.hash='';return a.href===b.href;}catch{return false;}}
module.exports={sameDocument};
