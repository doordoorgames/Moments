import {wordCount} from './words';
test.each([
  ['',0],['... !!!',0],[" Hi, there!\nMy name's Fred.",5],
  ['one-word count',2],['مرحبا يا أصحاب فوق هذا السطح',6],
  ['She said “PANCAKE!” then grabbed some ICE.',7],
  ['one two three four five',5],['one  two\nthree\tfour five six seven',7]
])('counts %s as %i words', (text,count)=>expect(wordCount(text)).toBe(count));
