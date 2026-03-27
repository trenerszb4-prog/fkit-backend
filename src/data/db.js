// ⚠️ ВАЖНО:
// Этот файл теперь используется ТОЛЬКО для временных данных (runtime)
// Все постоянные данные (users, sessions, decks и т.д.) хранятся в PostgreSQL

const participants = [];
const screenCards = [];
const timerStates = [];
const questionStates = [];
const reactions = [];

module.exports = {
  participants,
  screenCards,
  timerStates,
  questionStates,
  reactions
};