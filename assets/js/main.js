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
  let pendingSubmissionCount = 0;

  const beforeUnloadHandler = (event) => {
    if (pendingSubmissionCount <= 0) return;
    event.preventDefault();
    event.returnValue = '';
  };

  window.addEventListener('beforeunload', beforeUnloadHandler);

  forms.forEach((form) => {
    const msg = form.querySelector('.form-message');
    const submitButton = form.querySelector('button[type=\"submit\"]');
    const fileInput = form.querySelector('input[type=\"file\"]');
    const successMode = form.dataset.successMode || '';
    const isApplicationForm = successMode === 'application' || form.dataset.form === 'apply';
    const applyLayout = form.querySelector('.apply-layout');
    const applySuccess = form.querySelector('[data-apply-success]');
    const applySuccessId = form.querySelector('[data-apply-success-id]');
    const applySuccessPdf = form.querySelector('[data-apply-success-pdf]');
    const applySuccessStorage = form.querySelector('[data-apply-success-storage]');
    const applySuccessNote = form.querySelector('[data-apply-success-note]');
    const applySuccessCopyButton = form.querySelector('[data-copy-apply-id]');
    const resetApplyButton = form.querySelector('[data-reset-apply-form]');
    const applyNavButtons = Array.from(form.querySelectorAll('[data-step-prev], [data-step-next], [data-step-jump]'));
    const submitType = form.dataset.submitType || '';
    const isMultipart =
      submitType === 'multipart' ||
      form.enctype === 'multipart/form-data' ||
      Boolean(fileInput);

    const setMessage = (text, tone = '') => {
      if (!msg) return;
      msg.textContent = text || '';
      msg.hidden = !text;
      msg.classList.remove('error', 'success', 'pending');
      if (tone) {
        msg.classList.add(tone);
      }
    };

    const setApplyControlsDisabled = (disabled) => {
      if (!applyLayout) return;
      applyLayout.querySelectorAll('input, select, textarea, button').forEach((control) => {
        control.disabled = disabled;
      });
    };

    const setSubmittingState = (isSubmitting) => {
      form.classList.toggle('is-submitting', isSubmitting);
      form.setAttribute('aria-busy', String(isSubmitting));
      applyNavButtons.forEach((button) => {
        button.disabled = isSubmitting;
      });

      if (submitButton) {
        submitButton.disabled = isSubmitting;
        if (isSubmitting) {
          submitButton.dataset.originalLabel = submitButton.dataset.originalLabel || submitButton.textContent;
          submitButton.textContent = isApplicationForm ? 'Submitting Application...' : 'Sending...';
        } else {
          submitButton.textContent = submitButton.dataset.originalLabel || 'Submit';
        }
      }
    };

    const parseResponse = async (response) => {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          return await response.json();
        } catch {
          return null;
        }
      }
      try {
        const text = await response.text();
        return text ? { message: text } : null;
      } catch {
        return null;
      }
    };

    const formatStatus = (value, fallback) => {
      if (!value) return fallback;
      return String(value)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const showApplySuccessState = (responseData) => {
      if (!applySuccess) return;
      setApplyControlsDisabled(true);
      if (applyLayout) {
        applyLayout.hidden = true;
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Application Submitted';
      }
      applySuccess.hidden = false;
      if (applySuccessId) {
        applySuccessId.textContent = responseData?.id || 'Submitted';
      }
      if (applySuccessCopyButton) {
        applySuccessCopyButton.dataset.copyValue = responseData?.id || '';
        applySuccessCopyButton.textContent = 'Copy';
      }
      if (applySuccessPdf) {
        applySuccessPdf.textContent = formatStatus(responseData?.pdfStatus, 'Generated');
      }
      if (applySuccessStorage) {
        applySuccessStorage.textContent = formatStatus(responseData?.storage, 'Recorded');
      }
      if (applySuccessNote) {
        const emailStatus = String(responseData?.emailStatus || '').toLowerCase();
        applySuccessNote.textContent = emailStatus === 'sent'
          ? 'Your application record was submitted successfully and our funding team has been notified. Keep this reference ID for your records.'
          : 'Your application record was submitted successfully. Keep this reference ID for your records; our team can use it to locate your submission.';
      }

      setMessage('', '');
      applySuccess.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestAnimationFrame(() => applySuccess.focus());
    };

    if (resetApplyButton) {
      resetApplyButton.addEventListener('click', () => {
        window.location.reload();
      });
    }

    if (applySuccessCopyButton) {
      applySuccessCopyButton.addEventListener('click', async () => {
        const value = applySuccessCopyButton.dataset.copyValue || applySuccessId?.textContent || '';
        if (!value || value === 'Pending') return;

        try {
          await navigator.clipboard.writeText(value);
          applySuccessCopyButton.textContent = 'Copied';
        } catch {
          applySuccessCopyButton.textContent = 'Copy ID';
        }
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(
        isApplicationForm
          ? 'Submitting your application. One click is enough. Please do not refresh or close this page while we generate your PDF...'
          : '',
        isApplicationForm ? 'pending' : '',
      );
      setSubmittingState(true);
      pendingSubmissionCount += 1;

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
        const responseData = await parseResponse(response);

        if (!response.ok) {
          const errorMessage =
            responseData?.error ||
            responseData?.message ||
            'We could not submit your request right now. Please try again later.';
          throw new Error(errorMessage);
        }

        if (isApplicationForm) {
          showApplySuccessState(responseData || {});
        } else {
          form.reset();
          setMessage('Thanks! We received your request.', 'success');
        }
      } catch (error) {
        const fallbackError = isApplicationForm
          ? 'Your application was not submitted. Please try again or contact info@nolimitcap.net.'
          : 'We could not submit your request right now. Please try again later.';
        setMessage(isApplicationForm ? fallbackError : error.message || fallbackError, 'error');
        if (msg) {
          msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } finally {
        pendingSubmissionCount = Math.max(0, pendingSubmissionCount - 1);
        if (!applySuccess || applySuccess.hidden) {
          setSubmittingState(false);
        } else {
          form.setAttribute('aria-busy', 'false');
          form.classList.remove('is-submitting');
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Application Submitted';
          }
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
