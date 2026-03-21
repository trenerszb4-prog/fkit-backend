const bcrypt = require('bcryptjs');

const users = [
  {
    id: 'u1',
    name: 'Главный ведущий',
    email: 'admin@test.com',
    passwordHash: bcrypt.hashSync('1234', 10)
  }
];

const services = [
  {
    id: 'cards',
    title: 'Карты',
    description: 'Сервис метафорических карт'
  }
];

const decks = [
  {
    id: 'deck1',
    title: 'Стандартная колода 1',
    backImageUrl: 'https://static.tildacdn.com/tild3464-3265-4438-b064-343561393438/photo.jpg'
  }
];

const deckCards = [
  {
    id: 'c1',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6433-6435-4234-b661-643033656363/Cards_1.jpg',
    orderIndex: 1
  },
  {
    id: 'c2',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3637-6634-4034-b730-643166373530/Cards_2.jpg',
    orderIndex: 2
  },
  {
    id: 'c3',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6466-6133-4234-b864-383337326638/Cards_3.jpg',
    orderIndex: 3
  },
  {
    id: 'c4',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6132-6361-4637-b930-663239366561/Cards_4.jpg',
    orderIndex: 4
  },
  {
    id: 'c5',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3631-6163-4438-b334-313262373564/Cards_5.jpg',
    orderIndex: 5
  },
  {
    id: 'c6',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3430-3262-4432-a539-313339636562/Cards_6.jpg',
    orderIndex: 6
  },
  {
    id: 'c7',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3630-3464-4264-b364-643561386361/Cards_7.jpg',
    orderIndex: 7
  },
  {
    id: 'c8',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6436-3338-4138-b965-313966323834/Cards_8.jpg',
    orderIndex: 8
  },
  {
    id: 'c9',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6638-3239-4961-a161-356630393239/Cards_9.jpg',
    orderIndex: 9
  },
  {
    id: 'c10',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3537-3137-4565-a565-393861393839/Cards_10.jpg',
    orderIndex: 10
  },
  {
    id: 'c11',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3663-3636-4539-a431-373766653836/Cards_11.jpg',
    orderIndex: 11
  },
  {
    id: 'c12',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6331-3232-4564-b235-386162623466/Cards_12.jpg',
    orderIndex: 12
  },
  {
    id: 'c13',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6662-3134-4136-a436-356462363232/Cards_13.jpg',
    orderIndex: 13
  },
  {
    id: 'c14',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6666-3039-4964-a133-616264346133/Cards_14.jpg',
    orderIndex: 14
  },
  {
    id: 'c15',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3133-6531-4036-a334-386662373566/Cards_15.jpg',
    orderIndex: 15
  },
  {
    id: 'c16',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6364-3461-4532-b131-356136666239/Cards_16.jpg',
    orderIndex: 16
  },
  {
    id: 'c17',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6365-6335-4966-a666-383666616461/Cards_17.jpg',
    orderIndex: 17
  },
  {
    id: 'c18',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3866-6439-4735-b036-623436373765/Cards_18.jpg',
    orderIndex: 18
  },
  {
    id: 'c19',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6563-6632-4539-b130-386236373036/Cards_19.jpg',
    orderIndex: 19
  },
  {
    id: 'c20',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6566-3238-4634-b766-383266623630/Cards_20.jpg',
    orderIndex: 20
  },
  {
    id: 'c21',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6637-3433-4161-a163-643064613661/Cards_21.jpg',
    orderIndex: 21
  },
  {
    id: 'c22',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3265-6235-4736-b866-373930313763/Cards_22.jpg',
    orderIndex: 22
  },
  {
    id: 'c23',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6262-3534-4635-a162-333365393433/Cards_23.jpg',
    orderIndex: 23
  },
  {
    id: 'c24',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3730-3866-4162-b465-333935656433/Cards_24.jpg',
    orderIndex: 24
  },
  {
    id: 'c25',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6537-3735-4638-b833-396135646161/Cards_25.jpg',
    orderIndex: 25
  },
  {
    id: 'c26',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3537-3630-4163-a439-643266396161/Cards_26.jpg',
    orderIndex: 26
  },
  {
    id: 'c27',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6563-3461-4035-b064-343334393766/Cards_27.jpg',
    orderIndex: 27
  },
  {
    id: 'c28',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6133-6137-4265-a162-376664666439/Cards_28.jpg',
    orderIndex: 28
  },
  {
    id: 'c29',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3362-3462-4135-b430-336538353838/Cards_29.jpg',
    orderIndex: 29
  },
  {
    id: 'c30',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3530-3236-4534-b730-306635376164/Cards_30.jpg',
    orderIndex: 30
  },
  {
    id: 'c31',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3432-3438-4136-a661-366635343838/Cards_31.jpg',
    orderIndex: 31
  },
  {
    id: 'c32',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6365-3562-4439-b332-356139343163/Cards_32.jpg',
    orderIndex: 32
  },
  {
    id: 'c33',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3362-6163-4436-b537-356661303761/Cards_33.jpg',
    orderIndex: 33
  },
  {
    id: 'c34',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3537-6663-4430-a162-333735616333/Cards_34.jpg',
    orderIndex: 34
  },
  {
    id: 'c35',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6461-3432-4430-a265-636339623538/Cards_35.jpg',
    orderIndex: 35
  },
  {
    id: 'c36',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3663-3536-4234-b762-633339623363/Cards_36.jpg',
    orderIndex: 36
  },
  {
    id: 'c37',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3637-3866-4633-a464-363332316264/Cards_37.jpg',
    orderIndex: 37
  },
  {
    id: 'c38',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3838-3939-4363-b738-353163343136/Cards_38.jpg',
    orderIndex: 38
  },
  {
    id: 'c39',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3763-3638-4961-a334-646233633966/Cards_39.jpg',
    orderIndex: 39
  },
  {
    id: 'c40',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3536-3437-4634-b936-643163633435/Cards_40.jpg',
    orderIndex: 40
  },
  {
    id: 'c41',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3233-3838-4239-b161-643139313936/Cards_41.jpg',
    orderIndex: 41
  },
  {
    id: 'c42',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6536-3961-4332-a139-623762386464/Cards_42.jpg',
    orderIndex: 42
  },
  {
    id: 'c43',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3736-6236-4166-b861-336165626665/Cards_43.jpg',
    orderIndex: 43
  },
  {
    id: 'c44',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6565-6133-4664-b761-396234323436/Cards_44.jpg',
    orderIndex: 44
  },
  {
    id: 'c45',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3439-3066-4133-a234-663937313664/Cards_45.jpg',
    orderIndex: 45
  },
  {
    id: 'c46',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild6433-6235-4564-b831-633166346630/Cards_46.jpg',
    orderIndex: 46
  },
  {
    id: 'c47',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3537-6237-4065-a339-626132353063/Cards_47.jpg',
    orderIndex: 47
  },
  {
    id: 'c48',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3465-6261-4635-b830-646639316235/Cards_48.jpg',
    orderIndex: 48
  },
  {
    id: 'c49',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3762-3937-4537-a433-396639363633/Cards_49.jpg',
    orderIndex: 49
  },
  {
    id: 'c50',
    deckId: 'deck1',
    imageUrl: 'https://static.tildacdn.com/tild3531-3034-4232-a163-313239343063/Cards_50.jpg',
    orderIndex: 50
  }
];

const sessions = [];
const participants = [];
const screenCards = [];
const timerStates = [];
const questionStates = [];

module.exports = {
  users,
  services,
  decks,
  deckCards,
  sessions,
  participants,
  screenCards,
  timerStates,
  questionStates
};