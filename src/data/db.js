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
    title: 'Базовая колода',
    backImageUrl: '/images/deck1/back.jpg'
  }
];

const deckCards = [
  { id: 'c1', deckId: 'deck1', imageUrl: '/images/deck1/1.jpg', orderIndex: 1 },
  { id: 'c2', deckId: 'deck1', imageUrl: '/images/deck1/2.jpg', orderIndex: 2 },
  { id: 'c3', deckId: 'deck1', imageUrl: '/images/deck1/3.jpg', orderIndex: 3 },
  { id: 'c4', deckId: 'deck1', imageUrl: '/images/deck1/4.jpg', orderIndex: 4 },
  { id: 'c5', deckId: 'deck1', imageUrl: '/images/deck1/5.jpg', orderIndex: 5 }
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