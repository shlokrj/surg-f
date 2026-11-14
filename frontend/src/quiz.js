import './quiz.css';

// Quiz card: a plain multiple-choice form. Answers are chosen with native radio inputs,
// graded locally on submit (the API returns correct_option_id on purpose).

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function optionRow(question, qIndex, option, state) {
  const chosen = state.quizAnswers[qIndex] === option.id;
  const submitted = state.quizSubmitted;
  const correct = option.id === question.correct_option_id;
  const stateClass = !submitted ? '' : correct ? ' is-correct' : chosen ? ' is-wrong' : ' is-idle';
  const tag = !submitted ? '' : correct ? (chosen ? 'Your answer · Correct' : 'Correct answer') : chosen ? 'Your answer' : '';
  return `<label class="quiz-option${stateClass}">
    <input type="radio" name="quiz-q${qIndex}" value="${escapeHtml(option.id)}" ${chosen ? 'checked' : ''} ${submitted ? 'disabled' : ''}>
    <span class="quiz-radio" aria-hidden="true"></span>
    <span class="quiz-option-text">${escapeHtml(option.text)}</span>
    ${tag ? `<span class="quiz-tag">${tag}</span>` : ''}
  </label>`;
}

function questionItem(question, qIndex, state) {
  const right = state.quizAnswers[qIndex] === question.correct_option_id;
  const feedback = !state.quizSubmitted ? '' : `<div class="quiz-feedback">
      <p><strong>${right ? 'Correct.' : 'Not quite.'}</strong> ${escapeHtml(question.explanation)}</p>
      ${question.search_q ? `<button type="button" class="quiz-watch" data-watch="${escapeHtml(question.search_q)}">Watch the ${escapeHtml(question.search_q)} in this video</button>` : ''}
    </div>`;
  return `<li class="quiz-item"><fieldset>
    <legend><span class="quiz-num">${qIndex + 1}.</span><span>${escapeHtml(question.prompt)}</span></legend>
    <div class="quiz-options">${question.options.map(option => optionRow(question, qIndex, option, state)).join('')}</div>
    ${feedback}
  </fieldset></li>`;
}

export function quizCard(state) {
  const quiz = state.quiz;
  if (!quiz?.questions?.length) {
    return '<section class="feature-card quiz"><h2>Cholecystectomy quiz</h2><p>The quiz could not be loaded. Check the backend connection and try again.</p></section>';
  }
  const total = quiz.questions.length;
  const answered = quiz.questions.filter((_, i) => state.quizAnswers[i]).length;
  const score = quiz.questions.filter((q, i) => state.quizAnswers[i] === q.correct_option_id).length;
  const notes = [
    quiz.reviewed === false ? 'Practice content. It has not been reviewed by a clinician yet.' : '',
    quiz.demo ? 'This is a saved sample quiz because the backend could not be reached.' : '',
  ].filter(Boolean);
  const footer = state.quizSubmitted
    ? `<p class="quiz-score" role="status"><strong>${score} of ${total} correct</strong></p>
       <button type="button" class="quiz-submit" id="quiz-new">Try another quiz</button>`
    : `<p class="quiz-progress" id="quiz-progress">${answered} of ${total} answered</p>
       <button type="submit" class="quiz-submit" ${answered < total ? 'disabled' : ''}>Submit answers</button>`;
  return `<section class="feature-card quiz">
    <h2>Cholecystectomy quiz</h2>
    <p class="quiz-intro">${total} questions about the operation in general. They are not specific to ${escapeHtml(state.caseId)}.</p>
    ${notes.map(note => `<p class="quiz-note">${note}</p>`).join('')}
    <form id="quiz-form" novalidate>
      <ol class="quiz-list">${quiz.questions.map((question, i) => questionItem(question, i, state)).join('')}</ol>
      <div class="quiz-foot">${footer}</div>
    </form>
  </section>`;
}

// Selecting an option updates state and the footer in place, so the page (and the video)
// is not re-rendered on every click. Only submitting re-renders.
export function wireQuiz(state, { render, newQuiz }) {
  const form = document.querySelector('#quiz-form');
  if (!form) return;
  const total = state.quiz?.questions?.length ?? 0;
  form.addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('input[type="radio"]')) return;
    state.quizAnswers[Number(input.name.replace('quiz-q', ''))] = input.value;
    const answered = Object.keys(state.quizAnswers).length;
    form.querySelector('#quiz-progress').textContent = `${answered} of ${total} answered`;
    form.querySelector('.quiz-submit').disabled = answered < total;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (Object.keys(state.quizAnswers).length < total) return;
    state.quizSubmitted = true;
    render();
    document.querySelector('.quiz-score')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  form.querySelector('#quiz-new')?.addEventListener('click', newQuiz);
}
