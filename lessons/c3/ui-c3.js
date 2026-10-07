/* =====================================================================
   c3/ui-c3.js — проверка части 3: задания вперемешку по урокам 3.1–3.8
   и задача на сцене (добавляется после приёмки уроков). Общий движок — shared/check.js.
   ===================================================================== */
(function () {
  'use strict';
  const LESSON = {
    '3.1': ['RT-1', '3-1-rt-1.html'],
    '3.2': ['Vision-language модели', '3-2-vision-language-modeli.html'],
    '3.3': ['RT-2', '3-3-rt-2.html'],
    '3.4': ['Open X-Embodiment', '3-4-open-x-embodiment.html'],
    '3.5': ['Открытые VLA: Octo, OpenVLA', '3-5-otkrytye-vla.html'],
    '3.6': ['π0', '3-6-pi0.html'],
    '3.7': ['Двухуровневые архитектуры: Helix, GR00T, Gemini Robotics', '3-7-dvukhurovnevye-arkhitektury.html'],
    '3.8': ['Обобщение и рассуждение: от π0.5 до π0.7', '3-8-obobshchenie-i-rassuzhdenie.html'],
  };
  const Q = [
    /* @@Q31@@ */
    /* @@Q32@@ */
    /* @@Q33@@ */
    /* @@Q34@@ */
    /* @@Q35@@ */
    /* @@Q36@@ */
    /* @@Q37@@ */
    /* @@Q38@@ */
    /* @@SCENE@@ */
  ];
  const n = Q.length; const cnt = document.getElementById('chkCount'); if (cnt) cnt.textContent = `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}`;
  PartCheck({ lessons: LESSON, questions: Q, passText: 'Часть 3 усвоена, можно идти дальше.', expose: '__c3' });
})();
