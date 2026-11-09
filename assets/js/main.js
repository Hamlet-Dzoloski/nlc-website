(() => {
  const body = document.body;
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');

  if (navToggle && nav) {
    const mobileNav = window.matchMedia('(max-width: 860px)');
    nav.id = nav.id || 'site-navigation';
    nav.setAttribute('aria-label', 'Primary navigation');
    navToggle.setAttribute('aria-controls', nav.id);
    const setNavOpen = (open, restoreFocus = false) => {
      body.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      nav.inert = mobileNav.matches && !open;
      if (restoreFocus) navToggle.focus();
    };
    setNavOpen(false);
    navToggle.addEventListener('click', () => setNavOpen(!body.classList.contains('nav-open')));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setNavOpen(false); });
    mobileNav.addEventListener('change', () => setNavOpen(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && body.classList.contains('nav-open')) setNavOpen(false, true);
    });
    document.addEventListener('click', event => {
      if (body.classList.contains('nav-open') && !event.target.closest('[data-nav], [data-nav-toggle]')) setNavOpen(false);
    });
  }

  const playlistVideo = document.querySelector('[data-video-playlist]');
  if (playlistVideo) {
    const source = (playlistVideo.dataset.videoPlaylist || '').split(',')[0].trim();
    const toggle = document.querySelector('[data-video-toggle]');
    const desktop = matchMedia('(min-width: 861px)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    let userPaused = false, visible = true, ready = false;
    const refreshVideo = () => {
      const allowed = source && ready && desktop.matches && !reducedMotion.matches && !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
      if (!allowed) {
        playlistVideo.pause();
        if (playlistVideo.hasAttribute('src')) { playlistVideo.removeAttribute('src'); playlistVideo.load(); }
        if (toggle) toggle.hidden = true;
        return;
      }
      if (toggle) {
        toggle.hidden = false;
        toggle.textContent = userPaused ? 'Play background video' : 'Pause background video';
        toggle.setAttribute('aria-pressed', String(userPaused));
      }
      if (!visible || document.hidden || userPaused) { playlistVideo.pause(); return; }
      if (!playlistVideo.hasAttribute('src')) playlistVideo.src = source;
      playlistVideo.play().catch(() => {
        userPaused = true;
        if (toggle) { toggle.textContent = 'Play background video'; toggle.setAttribute('aria-pressed', 'true'); }
      });
    };
    toggle?.addEventListener('click', () => { userPaused = !userPaused; refreshVideo(); });
    desktop.addEventListener('change', refreshVideo);
    reducedMotion.addEventListener('change', refreshVideo);
    connection?.addEventListener('change', refreshVideo);
    document.addEventListener('visibilitychange', refreshVideo);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      refreshVideo();
    }).observe(playlistVideo);
    const start = () => setTimeout(() => { ready = true; refreshVideo(); }, 750);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  const apiBase = window.NCAP_API_BASE || body.dataset.apiBase || '';
  const createSubmissionId = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
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

    const statementInput = form.querySelector('input[name="bank_statements"]');
    const statementList = form.querySelector('[data-statement-files]');
    const statementSummary = form.querySelector('#bank-statements-summary');
    const statementError = form.querySelector('#bank-statements-error');
    let statementFiles = [];
    const uploadedStatements = new Map();
    let submitting = false;
    let submitted = false;
    let submissionId;
    if (isApplicationForm) {
      try {
        submissionId = sessionStorage.getItem('ncap-submission-id');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId || '')) submissionId = createSubmissionId();
        sessionStorage.setItem('ncap-submission-id', submissionId);
      } catch { submissionId = createSubmissionId(); }
    }

    const renderStatements = () => {
      if (!statementList || !statementSummary) return;
      statementList.replaceChildren();
      statementList.hidden = statementFiles.length === 0;
      const totalBytes = statementFiles.reduce((total, file) => total + file.size, 0);
      statementSummary.textContent = statementFiles.length
        ? `${statementFiles.length} of 10 PDFs selected (${(totalBytes / 1024 / 1024).toFixed(2)} MB total).${totalBytes >= 25 * 1024 * 1024 ? ' Some statements may exceed the email attachment limit; they will still be submitted for storage.' : ''}`
        : 'No PDFs selected.';
      statementFiles.forEach((file, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${file.name}`);
        remove.addEventListener('click', () => {
          statementFiles.splice(index, 1);
          if (statementError) statementError.hidden = true;
          renderStatements();
          (form.querySelector('[data-add-statements]') || statementInput).focus();
        });
        item.append(name, remove);
        statementList.append(item);
      });
    };

    if (statementInput && statementList) {
      const addStatementsButton = form.querySelector('[data-add-statements]');
      if (addStatementsButton) {
        statementInput.hidden = true;
        addStatementsButton.hidden = false;
        addStatementsButton.addEventListener('click', () => statementInput.click());
      }
      statementInput.addEventListener('change', () => {
        const errors = [];
        for (const file of Array.from(statementInput.files || [])) {
          if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
            errors.push(`${file.name}: please choose a PDF file.`);
            continue;
          }
          if (file.size > 80 * 1024 * 1024) {
            errors.push(`${file.name}: each PDF must be 80MB or smaller.`);
            continue;
          }
          if (statementFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) continue;
          if (statementFiles.length >= 10) {
            errors.push(`${file.name}: only 10 PDFs can be selected. Remove a file to add another.`);
            continue;
          }
          statementFiles.push(file);
        }
        // Retain File objects separately so another picker selection adds files.
        statementInput.value = '';
        if (statementError) {
          statementError.textContent = errors.join(' ');
          statementError.hidden = errors.length === 0;
        }
        renderStatements();
      });
      form.addEventListener('reset', () => {
        statementFiles = [];
        if (statementError) statementError.hidden = true;
        renderStatements();
      });
    }

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
      submitted = true;
      setApplyControlsDisabled(true);
      if (applyLayout) {
        applyLayout.hidden = true;
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Application Submitted';
      }
      applySuccess.hidden = false;
      const pending = responseData.processingStatus === 'processing';
      const needsAttention = responseData.processingStatus === 'attention_required';
      form.querySelector('[data-apply-success-badge]').textContent = pending ? 'Application received' : needsAttention ? 'Application saved' : 'Application submitted';
      form.querySelector('[data-apply-success-heading]').textContent = pending
        ? 'Your application is saved and processing is pending.'
        : needsAttention ? 'Your application is saved and needs a follow-up.' : 'Your application was submitted successfully.';
      form.querySelector('[data-apply-success-copy]').textContent = 'Please do not submit it again. Keep your reference ID for any follow-up.';
      try { sessionStorage.removeItem('ncap-submission-id'); } catch {}
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
        applySuccessStorage.textContent = 'Safely received';
      }
      if (applySuccessNote) {
        const emailStatus = String(responseData?.emailStatus || '').toLowerCase();
        applySuccessNote.textContent = pending
          ? 'Your information and signatures are safely stored. Contact info@nolimitcap.net with your reference ID if you need an update.'
          : needsAttention
          ? 'Your information and signatures are safely stored, but document processing or the team notification needs a follow-up. Contact info@nolimitcap.net with your reference ID.'
          : emailStatus === 'sent'
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
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (submitting || submitted) return;
      if (isApplicationForm && typeof form.NCAP_VALIDATE_ALL === 'function' && !form.NCAP_VALIDATE_ALL()) return;
      if (isApplicationForm && typeof window.NCAP_VALIDATE_SIGNATURES === 'function' && !window.NCAP_VALIDATE_SIGNATURES()) return;
      submitting = true;
      setMessage(
        isApplicationForm
          ? 'Submitting your application. One click is enough. Please do not refresh or close this page while we generate your PDF...'
          : '',
        isApplicationForm ? 'pending' : '',
      );
      setSubmittingState(true);
      pendingSubmissionCount += 1;

      if (isApplicationForm && typeof window.NCAP_SYNC_SIGNATURES === 'function') {
        window.NCAP_SYNC_SIGNATURES();
      }

      const formData = new FormData(form);
      if (statementInput && statementList) {
        formData.delete('bank_statements');
        statementFiles.forEach((file) => formData.append('bank_statements', file, file.name));
      }
      let endpoint = form.dataset.endpoint || `${apiBase}/api/contact`;
      if (endpoint.startsWith('/') && apiBase) {
        endpoint = `${apiBase}${endpoint}`;
      }
      let payload = null;
      let fetchOptions = null;
      let applicationRequestStarted = false;

      if (isApplicationForm) {
        payload = Object.fromEntries(formData);
        delete payload.bank_statements;
        payload.submission_id = submissionId;
        payload.form = form.dataset.form || 'apply';
        payload.page = window.location.pathname;
        payload.uploaded_statements = [];
        fetchOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '' };
      } else if (isMultipart) {
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
        if (isApplicationForm) {
          setApplyControlsDisabled(true);
          for (const [index, file] of statementFiles.entries()) {
            if (!uploadedStatements.has(file)) {
              setMessage(`Uploading statement ${index + 1} of ${statementFiles.length}. Please keep this page open...`, 'pending');
              const signing = await fetch(`${apiBase}/api/application/uploads`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submission_id: submissionId, files: [{ name: file.name, size: file.size, type: file.type }] }),
              });
              const signed = await parseResponse(signing);
              if (!signing.ok || !signed?.uploads?.[0]) throw new Error('We could not prepare your PDF upload. Your application has not been submitted. Please try again.');
              const upload = signed.uploads[0];
              const data = new FormData();
              Object.entries(upload.fields).forEach(([key, value]) => data.append(key, value));
              data.append('file', file, file.name);
              const result = await fetch(upload.url, { method: 'POST', body: data });
              if (!result.ok) throw new Error(`We could not upload ${file.name}. Your application has not been submitted. Please try again.`);
              uploadedStatements.set(file, upload.receipt);
            }
            payload.uploaded_statements.push(uploadedStatements.get(file));
          }
          setMessage('Your PDFs are uploaded. Saving your application and preparing the application document...', 'pending');
          fetchOptions.body = JSON.stringify(payload);
        }
        applicationRequestStarted = isApplicationForm;
        const response = await fetch(endpoint, fetchOptions);
        const responseData = await parseResponse(response);

        if (!response.ok) {
          const errorMessage =
            responseData?.error ||
            'We could not submit your request right now. Please try again later.';
          const submissionError = new Error(errorMessage);
          submissionError.status = response.status;
          throw submissionError;
        }

        if (isApplicationForm) {
          if (!responseData?.ok || !responseData?.durable || responseData.storage !== 's3' || !responseData.id) throw new Error('The server did not confirm that your application was safely saved. Please try again.');
          showApplySuccessState(responseData || {});
        } else {
          form.reset();
          setMessage('Thanks! We received your request.', 'success');
        }
      } catch (error) {
        const fallbackError = isApplicationForm
          ? 'Your application was not submitted. Please try again or contact info@nolimitcap.net.'
          : 'We could not submit your request right now. Please try again later.';
        const uncertainResult = isApplicationForm && applicationRequestStarted && (!error.status || error.status === 502 || error.status === 504);
        setMessage(uncertainResult
          ? 'We could not confirm the result. Your information is still here. Try Submit again on this page; retrying will not create a duplicate application.'
          : error.message || fallbackError, 'error');
        if (msg) {
          msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } finally {
        submitting = false;
        pendingSubmissionCount = Math.max(0, pendingSubmissionCount - 1);
        if (!applySuccess || applySuccess.hidden) {
          if (isApplicationForm) setApplyControlsDisabled(false);
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
    form.noValidate = true;
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

    form.NCAP_VALIDATE_ALL = () => {
      for (const [index, step] of steps.entries()) {
        for (const field of step.querySelectorAll('input, select, textarea')) {
          if (!field.checkValidity()) {
            current = index;
            update();
            const message = form.querySelector('.form-message');
            if (message) {
              message.textContent = 'Please complete the highlighted field before submitting your application.';
              message.hidden = false;
              message.classList.remove('success', 'pending');
              message.classList.add('error');
            }
            field.focus();
            field.reportValidity();
            return false;
          }
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

  // Accessible modal: announce the dialog, isolate the background, keep keyboard
  // focus inside, and restore it to the original trigger on every closing path.
  const modalTriggers = document.querySelectorAll('[data-open-modal]');
  const modalCloseButtons = document.querySelectorAll('[data-close-modal]');
  const modals = document.querySelectorAll('[data-modal]');

  let activeModal = null, modalTrigger = null, previousOverflow = '';
  const previousInert = new Map();
  const closeModal = () => {
    if (!activeModal) return;
    activeModal.classList.remove('active');
    activeModal.setAttribute('aria-hidden', 'true');
    previousInert.forEach((value, element) => { element.inert = value; });
    previousInert.clear();
    document.body.style.overflow = previousOverflow;
    modalTrigger?.setAttribute('aria-expanded', 'false');
    modalTrigger?.focus();
    activeModal = null;
  };
  modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modalId = trigger.dataset.openModal;
      const modal = document.getElementById(modalId);
      if (modal) {
        if (activeModal) closeModal();
        activeModal = modal;
        modalTrigger = trigger;
        previousOverflow = document.body.style.overflow;
        Array.from(document.body.children).forEach(element => {
          if (element !== modal && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) {
            previousInert.set(element, element.inert);
            element.inert = true;
          }
        });
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        trigger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
        modal.querySelector('[role="dialog"]').focus();
      }
    });
  });

  // Close modal via close button
  modalCloseButtons.forEach(button => {
    button.addEventListener('click', () => {
      closeModal();
    });
  });

  // Close modal via overlay click
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  });

  // Close modal via Escape key
  document.addEventListener('keydown', (e) => {
    if (!activeModal) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key === 'Tab' && activeModal) {
      const focusable = Array.from(activeModal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement.getAttribute('role') === 'dialog')) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();
