(() => {
  const body = document.body;
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      body.classList.toggle('nav-open');
    });
  }

  document.addEventListener('click', (event) => {
    if (!body.classList.contains('nav-open')) {
      return;
    }
    if (event.target.closest('[data-nav]') || event.target.closest('[data-nav-toggle]')) {
      return;
    }
    body.classList.remove('nav-open');
  });

  const playlistVideo = document.querySelector('[data-video-playlist]');
  if (playlistVideo) {
    const rawList = playlistVideo.dataset.videoPlaylist || '';
    const playlist = rawList
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (playlist.length > 0) {
      playlistVideo.querySelectorAll('source').forEach((source) => source.remove());
      let currentIndex = 0;
      playlistVideo.loop = playlist.length === 1;

      const playNext = () => {
        currentIndex = (currentIndex + 1) % playlist.length;
        playlistVideo.src = playlist[currentIndex];
        playlistVideo.load();
        playlistVideo.play().catch(() => {});
      };

      playlistVideo.src = playlist[currentIndex];
      playlistVideo.load();
      playlistVideo.play().catch(() => {});

      if (playlist.length > 1) {
        playlistVideo.addEventListener('ended', playNext);
        playlistVideo.addEventListener('error', playNext);
      }
    }
  }

  const apiBase = window.NCAP_API_BASE || body.dataset.apiBase || '';
  const forms = document.querySelectorAll('form[data-submit]');

  forms.forEach((form) => {
    const msg = form.querySelector('.form-message');
    const submitButton = form.querySelector('button[type=\"submit\"]');
    const fileInput = form.querySelector('input[type=\"file\"]');
    const submitType = form.dataset.submitType || '';
    const isMultipart =
      submitType === 'multipart' ||
      form.enctype === 'multipart/form-data' ||
      Boolean(fileInput);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (msg) {
        msg.textContent = '';
        msg.classList.remove('error', 'success');
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalLabel = submitButton.textContent;
        submitButton.textContent = 'Sending...';
      }

      const formData = new FormData(form);
      let endpoint = form.dataset.endpoint || `${apiBase}/api/contact`;
      if (endpoint.startsWith('/') && apiBase) {
        endpoint = `${apiBase}${endpoint}`;
      }
      let payload = null;
      let fetchOptions = null;

      if (isMultipart) {
        formData.append('form', form.dataset.form || 'general');
        formData.append('page', window.location.pathname);
        payload = formData;
        fetchOptions = {
          method: 'POST',
          body: payload,
        };
      } else {
        payload = {};
        formData.forEach((value, key) => {
          if (payload[key] !== undefined) {
            if (!Array.isArray(payload[key])) {
              payload[key] = [payload[key]];
            }
            payload[key].push(value);
          } else {
            payload[key] = value;
          }
        });
        payload.form = form.dataset.form || 'general';
        payload.page = window.location.pathname;
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        };
      }

      try {
        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
          throw new Error('Request failed');
        }

        form.reset();
        if (msg) {
          msg.textContent = 'Thanks! We received your request.';
          msg.classList.add('success');
        }
      } catch (error) {
        if (msg) {
          msg.textContent = 'We could not submit your request right now. Please try again later.';
          msg.classList.add('error');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = submitButton.dataset.originalLabel || 'Submit';
        }
      }
    });
  });

  const stepForms = document.querySelectorAll('[data-step-form]');
  stepForms.forEach((form) => {
    const steps = Array.from(form.querySelectorAll('[data-step]'));
    const nextButton = form.querySelector('[data-step-next]');
    const prevButton = form.querySelector('[data-step-prev]');
    const submitButton = form.querySelector('[data-step-submit]');
    const tabs = Array.from(form.querySelectorAll('[data-step-jump]'));
    const progressFill = form.querySelector('[data-progress-fill]');
    const progressText = form.querySelector('[data-progress-text]');
    const progressPercent = form.querySelector('[data-progress-percent]');

    if (steps.length === 0) return;
    let current = 0;

    const update = () => {
      steps.forEach((step, index) => {
        step.hidden = index !== current;
      });
      tabs.forEach((tab, index) => {
        tab.classList.toggle('active', index === current);
      });
      const percent = Math.round(((current + 1) / steps.length) * 100);
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `Step ${current + 1} of ${steps.length}`;
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (prevButton) prevButton.disabled = current === 0;
      if (nextButton) nextButton.style.display = current === steps.length - 1 ? 'none' : 'inline-flex';
      if (submitButton) submitButton.style.display = current === steps.length - 1 ? 'inline-flex' : 'none';
    };

    const validateStep = () => {
      const fields = Array.from(steps[current].querySelectorAll('input, select, textarea'));
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
      return true;
    };

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        if (!validateStep()) return;
        current = Math.min(current + 1, steps.length - 1);
        update();
      });
    }

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        current = Math.max(current - 1, 0);
        update();
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = Number(tab.dataset.stepJump || 0);
        if (!Number.isNaN(target)) {
          current = Math.max(0, Math.min(target, steps.length - 1));
          update();
        }
      });
    });

    update();
  });

  // Modal functionality
  const modalTriggers = document.querySelectorAll('[data-open-modal]');
  const modalCloseButtons = document.querySelectorAll('[data-close-modal]');
  const modals = document.querySelectorAll('[data-modal]');

  // Open modal
  modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modalId = trigger.dataset.openModal;
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  // Close modal via close button
  modalCloseButtons.forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('[data-modal]');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  // Close modal via overlay click
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  // Close modal via Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modals.forEach(modal => {
        if (modal.classList.contains('active')) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  });
})();
