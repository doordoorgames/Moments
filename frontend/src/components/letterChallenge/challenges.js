// Letter Challenge: temporary local question bank. Replace with the validated database later.
//
// LETTERS: the letters a round can use (Q, X, Z and other awkward letters left out).
// Each challenge has the lines shown on the TV (max 15 characters per line) and `skip`:
// letters with no reasonably common answer, so they are never paired with that challenge.
// `example` is one valid answer per letter, kept only to justify the pairing; never shown in game.

export const LETTERS = 'ABCDEFGHIJKLMNOPRSTW'.split('');

export const INTRO = ['ALL ANSWERS', 'START WITH:'];
export const ROUND_COMPLETE = ['ROUND', 'COMPLETE'];

export const CHALLENGES = [
  {id: 'country', lines: ['A COUNTRY', 'STARTING WITH:'], skip: '',
    example: 'Afghanistan Brazil Canada Denmark Egypt France Germany Hungary India Japan Kuwait Lebanon Mexico Norway Oman Peru Russia Spain Turkey Wales'},
  {id: 'fruit', lines: ['A FRUIT', 'STARTING WITH:'], skip: 'EI',
    example: 'Apple Banana Cherry Date - Fig Grape Honeydew - Jackfruit Kiwi Lemon Mango Nectarine Orange Peach Raspberry Strawberry Tangerine Watermelon'},
  {id: 'animal', lines: ['AN ANIMAL', 'STARTING WITH:'], skip: '',
    example: 'Ant Bear Cat Dog Elephant Fox Goat Horse Iguana Jaguar Kangaroo Lion Monkey Newt Owl Pig Rabbit Snake Tiger Wolf'},
  {id: 'girl-name', lines: ["A GIRL'S NAME", 'STARTING WITH:'], skip: '',
    example: 'Amal Bella Clara Dana Emma Fatima Grace Hana Iman Jana Kate Lina Mariam Noor Olivia Paula Rana Sara Tala Wafa'},
  {id: 'boy-name', lines: ["A BOY'S NAME", 'STARTING WITH:'], skip: '',
    example: 'Ahmad Bader Chris Daniel Essa Faisal George Hamad Ibrahim Jassim Khaled Liam Mohammed Nasser Omar Peter Rashid Salem Talal Waleed'},
  {id: 'household', lines: ['A HOUSEHOLD', 'ITEM STARTING', 'WITH:'], skip: 'E',
    example: 'Armchair Bed Chair Door - Fan Glass Hanger Iron Jar Kettle Lamp Mirror Napkin Oven Pillow Rug Sofa Table Window'},
  {id: 'eat', lines: ['SOMETHING YOU', 'CAN EAT THAT', 'STARTS WITH:'], skip: '',
    example: 'Avocado Bread Cheese Doughnut Egg Fries Garlic Hummus Ice cream Jam Kebab Lasagna Machboos Noodles Omelette Pizza Rice Sushi Toast Waffle'},
  {id: 'city', lines: ['A CITY', 'STARTING WITH:'], skip: '',
    example: 'Amsterdam Berlin Cairo Dubai Edinburgh Florence Geneva Hong Kong Istanbul Jeddah Kuwait City London Madrid Nairobi Oslo Paris Riyadh Sydney Tokyo Washington'},
  {id: 'job', lines: ['A JOB THAT', 'STARTS WITH:'], skip: 'K',
    example: 'Actor Baker Chef Doctor Engineer Farmer Gardener Hairdresser Interpreter Judge - Lawyer Mechanic Nurse Optician Pilot Reporter Singer Teacher Waiter'},
  {id: 'wear', lines: ['SOMETHING YOU', 'WEAR, STARTING', 'WITH:'], skip: 'IK',
    example: 'Abaya Belt Cap Dress Earrings Flip-flops Gloves Hat - Jacket - Leggings Mittens Necklace Overalls Pyjamas Ring Socks Tie Watch'},
  {id: 'kitchen', lines: ['SOMETHING IN', 'THE KITCHEN', 'STARTING WITH:'], skip: '',
    example: 'Apron Blender Cup Dishwasher Eggs Fridge Grater Honey Ice Jug Knife Ladle Microwave Napkin Oven Pan Rolling pin Sink Toaster Whisk'},
  {id: 'supermarket', lines: ['SOMETHING IN A', 'SUPERMARKET', 'STARTING WITH:'], skip: '',
    example: 'Apples Bread Cart Detergent Eggs Flour Grapes Honey Ice cream Juice Ketchup Lettuce Milk Nuts Olives Pasta Rice Sugar Tea Water'},
  {id: 'bedroom', lines: ['SOMETHING IN', 'A BEDROOM', 'STARTING WITH:'], skip: 'EGIKO',
    example: 'Alarm clock Bed Closet Desk - Fan - Hanger - Jewellery box - Lamp Mirror Nightstand - Pillow Rug Sheets TV Wardrobe'},
  {id: 'drink', lines: ['SOMETHING YOU', 'CAN DRINK', 'STARTING WITH:'], skip: 'DNR',
    example: 'Apple juice Bubble tea Coffee - Espresso Fanta Ginger ale Hot chocolate Iced tea Juice Karak Lemonade Milk - Orange juice Pepsi - Smoothie Tea Water'},
  {id: 'online', lines: ['SOMETHING YOU', 'CAN BUY ONLINE', 'STARTING WITH:'], skip: '',
    example: 'AirPods Books Charger Dress Earbuds Flowers Games Headphones iPad Jeans Keyboard Laptop Makeup Notebook Oven Perfume Rug Shoes T-shirt Watch'},
  {id: 'school', lines: ['SOMETHING AT', 'SCHOOL THAT', 'STARTS WITH:'], skip: 'IJKO',
    example: 'Atlas Backpack Chalk Desk Eraser Folder Glue Homework - - - Locker Marker Notebook - Pencil Ruler Scissors Teacher Whiteboard'},
  {id: 'bathroom', lines: ['SOMETHING IN', 'THE BATHROOM', 'STARTING WITH:'], skip: 'AEGIJKO',
    example: '- Bathtub Comb Deodorant - Floss - Hairdryer - - - Lotion Mirror Nail clipper - Perfume Razor Soap Towel Water'},
  {id: 'carry', lines: ['SOMETHING YOU', 'CAN CARRY', 'STARTING WITH:'], skip: '',
    example: 'Apple Bag Cup Doll Envelope Flowers Groceries Handbag iPad Jar Keys Laptop Mug Notebook Orange Phone Ruler Shopping bag Tray Wallet'},
  {id: 'outside', lines: ['SOMETHING YOU', 'SEE OUTSIDE', 'STARTING WITH:'], skip: 'EIJNO',
    example: 'Airplane Bird Car Dog - Flower Grass House - - Kite Leaves Moon - - Park Road Sun Tree Wind'},
  {id: 'party', lines: ['SOMETHING AT', 'A PARTY', 'STARTING WITH:'], skip: 'AEORW',
    example: '- Balloons Cake DJ - Food Gifts Hats Ice cream Juice Karaoke Lights Music Napkins - Pizza - Snacks Tables -'},
  {id: 'car', lines: ['SOMETHING IN', 'A CAR', 'STARTING WITH:'], skip: 'FIJN',
    example: 'Airbag Brakes Car seat Dashboard Engine - Gas pedal Horn - - Keys Lights Mirror - Oil Pedal Radio Seatbelt Tyre Wheel'},
  {id: 'sport', lines: ['A SPORT', 'STARTING WITH:'], skip: 'ELMO',
    example: 'Archery Basketball Cricket Diving - Football Golf Hockey Ice skating Judo Karate - - Netball - Padel Rugby Swimming Tennis Wrestling'},
  {id: 'mall', lines: ['SOMETHING AT', 'THE MALL', 'STARTING WITH:'], skip: 'INO',
    example: 'ATM Bags Cinema Doors Escalator Food court Gym H&M - Jewellery Kiosk Lift Mannequin - - Perfume Restaurant Shoes Toys Washroom'},
  {id: 'brand', lines: ['A FAMOUS BRAND', 'STARTING WITH:'], skip: 'EO',
    example: 'Apple BMW Chanel Dior - Ferrari Gucci Honda IKEA Jeep KFC Lego McDonald\'s Nike - Pepsi Rolex Samsung Toyota Walmart'},
  {id: 'colour', lines: ['A COLOUR', 'STARTING WITH:'], skip: 'ADEFHIJK',
    example: '- Blue Cream - - - Green - - - - Lilac Maroon Navy Orange Pink Red Silver Teal White'},
];

// Challenges that fit a letter, in a fresh random order. No repeats within a round.
export function roundFor(letter, random = Math.random) {
  const list = CHALLENGES.filter(c => !c.skip.includes(letter));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

export function newLetter(previous, random = Math.random) {
  const pool = LETTERS.filter(l => l !== previous);
  return pool[Math.floor(random() * pool.length)];
}

// Same helpers for any language's bank.
export function roundFrom(challenges, letter, random = Math.random) {
  const list = challenges.filter(c => !c.skip.includes(letter));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
export function letterFrom(letters, previous, random = Math.random) {
  const pool = letters.filter(l => l !== previous);
  return pool[Math.floor(random() * pool.length)];
}
