const slider = document.getElementById('slider');
const val = document.getElementById('val');

chrome.storage.local.get({ reverbAmount: 50 }, (data) => {
  slider.value = data.reverbAmount;
  val.textContent = data.reverbAmount;
});

slider.addEventListener('input', () => {
  const v = Number(slider.value);
  val.textContent = v;
  chrome.storage.local.set({ reverbAmount: v });
});
