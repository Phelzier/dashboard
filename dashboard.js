        // This file is now served over https:// via GitHub Pages, not opened as a local file:// page -
        // that's what makes the service worker registration at the bottom of this file actually work
        // (service workers are blocked entirely on file:// origins). Offline viewing is handled by that
        // registration, not by this file being self-contained - CSS, JS, and thumbnails are now separate
        // files the browser caches individually, rather than one large inlined blob.

        // --- SUB-STEP 10.6: FIXED INTERACTIVE BUTTON MATCH ENGINE ---
        var activeStatusFilter = 'ALL'; var activeSelectedHasAssets = []; var activeSelectedMissingAssets = []; var trackMemoryErrorLedgers = {}; var shelfModeActive = true;
        var selectionModeActive = false; var selectedTrackIds = [];
        var BATCH_EMAIL_BODY_CHAR_LIMIT = 1800;

        function toggleSelectionMode() {
            selectionModeActive = !selectionModeActive;
            document.body.classList.toggle('selection-mode', selectionModeActive);
            document.getElementById('selectionModeBtn').innerText = selectionModeActive ? '☑️ Selecting...' : '☑️ Select Multiple';
            if (!selectionModeActive) { clearAllSelections(); }
        }
        function onCardSelectionChanged(trackDomId) {
            var idx = selectedTrackIds.indexOf(trackDomId);
            var checkbox = document.getElementById('select-' + trackDomId);
            if (checkbox.checked && idx === -1) { selectedTrackIds.push(trackDomId); }
            else if (!checkbox.checked && idx > -1) { selectedTrackIds.splice(idx, 1); }
            updateBatchBar();
        }
        function clearAllSelections() {
            selectedTrackIds.forEach(function(id) { var cb = document.getElementById('select-' + id); if (cb) cb.checked = false; });
            selectedTrackIds = [];
            updateBatchBar();
            closeBatchFeedbackForm();
        }
        function updateBatchBar() {
            var bar = document.getElementById('floatingBatchBar');
            bar.classList.toggle('has-selection', selectedTrackIds.length > 0);
            document.getElementById('batchBarCount').innerText = selectedTrackIds.length + ' selected';
        }
        function openBatchFeedbackForm() {
            if (selectedTrackIds.length === 0) { alert('Select at least one track first.'); return; }
            var listEl = document.getElementById('batchFeedbackTrackList');
            listEl.innerHTML = '';
            selectedTrackIds.forEach(function(id) {
                var name = document.getElementById('select-' + id).getAttribute('data-song-name');
                var row = document.createElement('div');
                row.className = 'subform-row';
                row.style.gridTemplateColumns = '1fr';
                row.innerHTML = '<label style="font-weight:700;">' + name + '</label><input type="text" class="subform-input batch-issue-input" data-track-id="' + id + '" data-track-name="' + name.replace(/"/g, '&quot;') + '" placeholder="Issue for this track (leave blank to skip)" />';
                listEl.appendChild(row);
            });
            document.getElementById('batchFeedbackPanel').style.display = 'block';
        }
        function closeBatchFeedbackForm() {
            document.getElementById('batchFeedbackPanel').style.display = 'none';
        }
        function dispatchBatchFeedbackViaEmail() {
            var inputs = document.querySelectorAll('.batch-issue-input');
            var sections = [];
            for (var i = 0; i < inputs.length; i++) {
                var issue = inputs[i].value.trim();
                if (issue) { sections.push('== ' + inputs[i].getAttribute('data-track-name') + ' ==\n' + 'Issue: ' + issue); }
            }
            if (sections.length === 0) { alert('Enter at least one issue before sending.'); return; }
            var body = '[ERROR REPORT BATCH]\n\n' + sections.join('\n\n') + '\n\nPlease append these to each track\'s Production\\errors.txt.';
            if (body.length > BATCH_EMAIL_BODY_CHAR_LIMIT) {
                // Body too long for a reliable mailto: link across mail clients - fall back to a downloadable text file instead.
                var blob = new Blob([body], { type: 'text/plain' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'batch_error_report.txt';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert('This batch report is long, so it was saved as a text file instead of opening your email app (most mail apps cut off very long pre-filled emails). Please attach the downloaded file to a new email to phelzier1@gmail.com with subject "[ERROR REPORT BATCH]".');
            } else {
                window.location.href = "mailto:phelzier1@gmail.com?subject=" + encodeURIComponent("[MLP] [ERROR REPORT BATCH] " + sections.length + " tracks") + "&body=" + encodeURIComponent(body);
            }
            closeBatchFeedbackForm();
            clearAllSelections();
        }

        function toggleViewLayout(m) { document.body.classList.remove('view-detailed', 'view-condensed'); document.getElementById('viewDetailedBtn').classList.remove('active-view'); document.getElementById('viewCondensedBtn').classList.remove('active-view'); if (m === 'condensed') { document.body.classList.add('view-condensed'); document.getElementById('viewCondensedBtn').classList.add('active-view'); } else { document.body.classList.add('view-detailed'); document.getElementById('viewDetailedBtn').classList.add('active-view'); } localStorage.setItem('dashboard_view_layout', m); }
        function toggleShelfMode() {
            shelfModeActive = !shelfModeActive;
            document.getElementById('shelfToggleBtn').innerText = '📁 Album Shelf: ' + (shelfModeActive ? 'ON' : 'OFF');
            localStorage.setItem('dashboard_shelf_mode', shelfModeActive ? '1' : '0');
            evaluateControlMatrix();
        }
        
        function applyStatusFilter(s) { 
            var cards = document.getElementsByClassName('summary-card'); for(var i=0; i<cards.length; i++) { cards[i].classList.remove('active-filter'); }
            if (activeStatusFilter === s) { activeStatusFilter = 'ALL'; } else { activeStatusFilter = s; }
            var targetId = (activeStatusFilter === 'ALL') ? 'btn-all' : (activeStatusFilter === 'READY') ? 'btn-ready' : (activeStatusFilter === 'MISSING') ? 'btn-missing' : 'btn-errors';
            document.getElementById(targetId).classList.add('active-filter'); evaluateControlMatrix();
        }
        function clearAllFilters() {
            document.getElementById('searchInput').value = '';
            document.getElementById('profileSelect').value = 'ALL';
            document.getElementById('albumContextSelect').value = 'ALL';
            document.getElementById('sortBySelect').value = 'none';
            activeSortKey = 'none';
            activeStatusFilter = 'ALL';
            activeSelectedHasAssets = [];
            activeSelectedMissingAssets = [];
            var summaryCards = document.getElementsByClassName('summary-card'); for (var i = 0; i < summaryCards.length; i++) { summaryCards[i].classList.remove('active-filter'); }
            document.getElementById('btn-all').classList.add('active-filter');
            var matrixBtns = document.getElementsByClassName('matrix-btn'); for (var j = 0; j < matrixBtns.length; j++) { matrixBtns[j].classList.remove('has-active', 'missing-active'); }
            evaluateControlMatrix();
        }
        
        function toggleMatrixTag(el, mode, assetName) {
            var targetArray = (mode === 'Has') ? activeSelectedHasAssets : activeSelectedMissingAssets;
            var assetIndex = targetArray.indexOf(assetName.toLowerCase());
            
            if (assetIndex > -1) {
                targetArray.splice(assetIndex, 1);
                el.classList.remove((mode === 'Has') ? 'has-active' : 'missing-active');
            } else {
                targetArray.push(assetName.toLowerCase());
                el.classList.add((mode === 'Has') ? 'has-active' : 'missing-active');
            }
            evaluateControlMatrix();
        }
        function toggleErrorSubmissionForm(id) { var panel = document.getElementById('subform-' + id); panel.style.display = (panel.style.display === 'block') ? 'none' : 'block'; }
        function togglePublicationForm(id) { var panel = document.getElementById('pubform-' + id); panel.style.display = (panel.style.display === 'block') ? 'none' : 'block'; }
        var currentUploadModalTrackId = null;
        var currentLyricsTrackContext = null;
        function toggleUploadPicker(id) {
            currentUploadModalTrackId = id;
            var card = document.getElementById(id);
            var title = card.getAttribute('data-title') || 'this track';
            document.getElementById('uploadModalTitle').innerText = 'Missing items: ' + title;

            var uploadEls = card.querySelectorAll('.uploadable[onclick*="triggerAssetUpload"]');
            var seenTypes = {};
            var rowsHtml = '';
            uploadEls.forEach(function(el) {
                var m = el.getAttribute('onclick').match(/triggerAssetUpload\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*"),"([^"]+)","([^"]*)","([^"]*)"\)/);
                if (!m) { return; }
                var rawNameArg = m[2], assetType = m[3], acceptAttr = m[4], expectedExt = m[5];
                if (seenTypes[assetType]) { return; }
                seenTypes[assetType] = true;
                var songName = JSON.parse(rawNameArg.replace(/\\'/g, "'"));
                var iconMap = { 'Cover': '🖼️', 'Lyrics': '📄', 'Canvas': '🎥', 'Clip': '✂️', 'Reel': '🎬', 'AlbumReel': '🎞️' };
                rowsHtml += '<div class="upload-modal-row"><span class="upload-modal-row-label">' + (iconMap[assetType] || '📤') + ' ' + assetType + '</span>' +
                            '<button class="upload-modal-row-btn" onclick=\'openUploadRowAction("' + id + '","' + songName.replace(/"/g, '\\"').replace(/'/g, "\\'") + '","' + assetType + '","' + acceptAttr + '","' + expectedExt + '")\'>Upload</button></div>';
            });

            document.getElementById('uploadModalRows').innerHTML = rowsHtml || '<div class="upload-modal-empty">Nothing missing on this track. 🎉</div>';
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('uploadModalBackdrop').classList.add('active');
        }
        function closeUploadModal() {
            document.getElementById('uploadModalBackdrop').classList.remove('active');
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('lyricsTextarea').value = '';
            currentLyricsTrackContext = null;
        }
        var ADMIN_IMPORT_MAX_BYTES = 18 * 1024 * 1024; // same ceiling as asset uploads - keeps base64-encoded size safely under Gmail's ~25MB limit
        function toggleAdminPanel() { document.getElementById('adminModalBackdrop').classList.add('active'); }
        function closeAdminPanel() { document.getElementById('adminModalBackdrop').classList.remove('active'); }
        function triggerAdminImport(importType) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.zip';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function() {
                var file = input.files && input.files[0];
                document.body.removeChild(input);
                if (!file) { return; }

                var fileExt = (file.name.split('.').pop() || '').toLowerCase();
                if (fileExt !== 'csv' && fileExt !== 'zip') {
                    alert('That file looks like a ".' + fileExt + '" file. Only .csv or .zip are accepted for admin imports.');
                    return;
                }
                if (file.size > ADMIN_IMPORT_MAX_BYTES) {
                    alert('That file is ' + (file.size / 1024 / 1024).toFixed(1) + 'MB, which is too large to import. Please use a smaller export (under 18MB), e.g. a narrower date range.');
                    return;
                }

                var snapshotDate = null;
                if (importType === 'artist_songs_1day') {
                    var todayStr = new Date().toISOString().slice(0, 10);
                    snapshotDate = prompt('Which date does this snapshot cover? (YYYY-MM-DD)', todayStr);
                    if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate.trim())) {
                        if (snapshotDate !== null) { alert('That doesn\'t look like a valid date (expected YYYY-MM-DD). Import cancelled.'); }
                        return;
                    }
                    snapshotDate = snapshotDate.trim();
                }

                var subject, body;
                if (importType === 'distrokid') {
                    subject = '[MLP] [DISTROKID IMPORT] ' + file.name;
                    body = 'Importing DistroKid export "' + file.name + '".\n\nIMPORTANT: tap the paperclip/attach icon in this email and attach the file you just picked (' + file.name + '), then send.\n\nFigures will be appended to the existing dataset and checked for duplicates.';
                } else if (importType === 'spotify_audience') {
                    subject = '[MLP] [SPOTIFY AUDIENCE IMPORT] ' + file.name;
                    body = 'Importing Spotify audience export "' + file.name + '".\n\nIMPORTANT: tap the paperclip/attach icon in this email and attach the file you just picked (' + file.name + '), then send.\n\nArtist is read from the filename. This will be stored and de-duplicated against that artist\'s existing dataset. Audience data is not shown on the dashboard yet.';
                } else if (importType === 'artist_songs_1day') {
                    subject = '[MLP] [ARTIST SONGS 1DAY - ' + snapshotDate + '] ' + file.name;
                    body = 'Importing artist songs 1-day snapshot for ' + snapshotDate + ': "' + file.name + '".\n\nIMPORTANT: tap the paperclip/attach icon in this email and attach the file you just picked (' + file.name + '), then send.\n\nThis is treated as the priority source for that date - re-uploading the same date later will correct it.';
                } else {
                    subject = '[MLP] [SONG TIMELINE IMPORT] ' + file.name;
                    body = 'Importing song timeline "' + file.name + '".\n\nIMPORTANT: tap the paperclip/attach icon in this email and attach the file you just picked (' + file.name + '), then send.\n\nSong is matched from the filename. This only fills in days not already covered by an artist songs 1-day upload.';
                }
                window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
                closeAdminPanel();
            }, { once: true });
            input.click();
        }
        function openUploadRowAction(id, songName, assetType, acceptAttr, expectedExt) {
            if (assetType === 'Lyrics') {
                currentLyricsTrackContext = { id: id, songName: songName, acceptAttr: acceptAttr, expectedExt: expectedExt };
                document.getElementById('uploadModalTitle').innerText = 'Lyrics: ' + songName;
                document.getElementById('uploadModalRows').innerHTML = '';
                document.getElementById('uploadModalBackdrop').classList.add('active');
                document.getElementById('lyricsEntryPanel').classList.add('active');
                document.getElementById('lyricsTextarea').focus();
                return;
            }
            triggerAssetUpload(id, songName, assetType, acceptAttr, expectedExt);
        }
        function switchLyricsToFileUpload() {
            if (!currentLyricsTrackContext) { return; }
            var ctx = currentLyricsTrackContext;
            triggerAssetUpload(ctx.id, ctx.songName, 'Lyrics', ctx.acceptAttr, ctx.expectedExt);
        }
        function dispatchLyricsTextViaEmail() {
            if (!currentLyricsTrackContext) { return; }
            var text = document.getElementById('lyricsTextarea').value.trim();
            if (!text) { alert('Type or paste the lyrics first, or tap "Upload a .txt file instead".'); return; }
            var name = currentLyricsTrackContext.songName;
            var subject = '[MLP] [ASSET UPLOAD TEXT] ' + name + ' - Lyrics';
            var body = 'Lyrics for "' + name + '":\n\n' + text + '\n\nPlease save this as the lyrics for this track.';
            window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            closeUploadModal();
        }
        function dispatchPublicationUpdateViaEmail(id, name) {
            var platform = document.getElementById('pub-platform-' + id).value.trim();
            var date = document.getElementById('pub-date-' + id).value.trim();
            var link = document.getElementById('pub-link-' + id).value.trim();
            if (!platform) { alert('Enter at least a platform name (e.g. Spotify) to mark this as published.'); return; }
            var body = "Publication update for \"" + name + "\":\n\nPlatform: " + platform + (date ? "\nDate: " + date : "") + (link ? "\nLink: " + link : "") + "\n\nPlease update this track's publication status.";
            window.location.href = "mailto:phelzier1@gmail.com?subject=" + encodeURIComponent("[MLP] [PUBLICATION UPDATE] " + name) + "&body=" + encodeURIComponent(body);
            togglePublicationForm(id);
        }
        function dispatchVerificationMarkViaEmail(id, name) {
            // One-tap, no form - the whole point is a fast human sign-off, not a multi-step process.
            // Timestamp is generated here (client-side, at the moment of the tap) rather than left for
            // the server to fill in on ingest, so it reflects when the person actually checked the track,
            // not whenever the next pipeline run happens to process the email.
            var timestamp = new Date().toISOString();
            var body = "Verification mark for \"" + name + "\":\n\nTimestamp: " + timestamp + "\n\nPlease record this as a verification for this track.";
            window.location.href = "mailto:phelzier1@gmail.com?subject=" + encodeURIComponent("[MLP] [VERIFY] " + name) + "&body=" + encodeURIComponent(body);
        }
        // Set this to the web app URL shown after deploying Code.gs/Index.html (Deploy > New deployment >
        // Web app). Placeholder until that one-time deployment step is done.
        var DRIVE_UPLOAD_FORM_URL = "https://script.google.com/macros/s/AKfycbyDUHTdym61L6ztjTgdO2E4ImWFDcKh6vFspTUIPe2Fz7qTLPcWt79rTPPHZNF17_c/exec";

        function triggerAssetUpload(id, name, assetType, acceptAttr, expectedExt) {
            // Browsers give JS no way to hand a picked File object to a different page or app - so unlike
            // the old mailto: flow (which could pre-attach nothing either, but at least stayed in the same
            // "compose" context), this opens the Drive upload form pre-filled with song name and asset
            // type, and the artist picks the file again there. One extra tap versus the old flow, but no
            // manual "now attach the file you just picked" step, since the form's own file input submits
            // directly into Drive.
            var url = DRIVE_UPLOAD_FORM_URL + '?song=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(assetType);
            window.open(url, '_blank');
        }
        function stageLocalErrorEntry(id, name) {
            var s = document.getElementById('input-stamp-' + id).value.trim(), i = document.getElementById('input-issue-' + id).value.trim(), f = document.getElementById('input-fix-' + id).value.trim();
            if (!i) { alert('Enter an issue description.'); return; } if (!trackMemoryErrorLedgers[id]) trackMemoryErrorLedgers[id] = [];
            var entry = '[' + new Date().toLocaleString() + '] ' + (s ? 'Loc: ' + s + ' | ' : '') + 'Issue: ' + i + (f ? ' -> Fix: ' + f : '');
            trackMemoryErrorLedgers[id].push(entry);
            var l = document.getElementById('ledger-' + id); l.style.display = 'flex'; var n = document.createElement('div'); n.className = 'staged-error-item'; n.innerText = entry; l.appendChild(n);
            document.getElementById(id).setAttribute('data-errors', 'YES'); var b = document.getElementById('logbox-' + id); if (b.style.display === 'none') { b.style.display = 'block'; b.innerHTML = '<strong>Active Error Log Context:</strong><br>'; } b.innerHTML += '• ' + entry + '<br>';
            document.getElementById('input-stamp-' + id).value = ''; document.getElementById('input-issue-' + id).value = ''; document.getElementById('input-fix-' + id).value = '';
        }
        function dispatchStagedErrorsViaEmail(id, name) {
            var l = trackMemoryErrorLedgers[id] || []; if (l.length === 0) { stageLocalErrorEntry(id, name); l = trackMemoryErrorLedgers[id] || []; if (l.length === 0) return; }
            window.location.href = "mailto:phelzier1@gmail.com?subject=" + encodeURIComponent("[MLP] [ERROR REPORT] Quality Control Suffix Notes: " + name) + "&body=" + encodeURIComponent("Correction entries for \"" + name + "\":\n\n" + l.join("\n") + "\n\nPlease append to Production\\errors.txt.");
            trackMemoryErrorLedgers[id] = []; document.getElementById('ledger-' + id).innerHTML = ''; document.getElementById('ledger-' + id).style.display = 'none'; toggleErrorSubmissionForm(id);
        }
        function checkCardAgainstActiveMatrixRules(card, query, targetProfile, albumContextMode) {
            var status = (card.getAttribute('data-status') || '').toLowerCase().trim();
            var errors = (card.getAttribute('data-errors') || '').toLowerCase().trim();
            var profileAttr = card.getAttribute('data-profile') || 'N/A';
            var isAlbumDir = card.getAttribute('data-is-album') === 'TRUE';
            
            var missingAssetsStr = (card.getAttribute('data-missing') || '').toLowerCase();
            var missingAssetsArray = missingAssetsStr ? missingAssetsStr.split(',') : [];
            var existingAssetsStr = (card.getAttribute('data-existing') || '').toLowerCase();
            var existingAssetsArray = existingAssetsStr ? existingAssetsStr.split(',') : [];
            
            var cardText = card.textContent.toLowerCase();
            
            var matchStatus = false;
            if (activeStatusFilter === 'ALL') { matchStatus = true; } 
            else if (activeStatusFilter === 'ERRORS') { matchStatus = (errors === 'yes'); } 
            else if (activeStatusFilter === 'MISSING') { matchStatus = (status !== 'ready'); } 
            else { matchStatus = (status === activeStatusFilter.toLowerCase().trim()); }
            
            var matchProfile = false;
            if (targetProfile === 'ALL') { matchProfile = true; } 
            else if (targetProfile === 'UNASSIGNED') { matchProfile = (profileAttr === 'N/A' || profileAttr === ''); } 
            else { matchProfile = (profileAttr === targetProfile); }
            
            var matchAlbumContext = false;
            if (albumContextMode === 'ALL') { matchAlbumContext = true; } 
            else if (albumContextMode === 'ALBUM') { matchAlbumContext = isAlbumDir; } 
            else { matchAlbumContext = !isAlbumDir; }
            
            var matchHasAssets = true;
            for (var j = 0; j < activeSelectedHasAssets.length; j++) {
                if (existingAssetsArray.indexOf(activeSelectedHasAssets[j]) === -1) { matchHasAssets = false; break; }
            }
            
            var matchMissingAssets = true;
            for (var k = 0; k < activeSelectedMissingAssets.length; k++) {
                if (missingAssetsArray.indexOf(activeSelectedMissingAssets[k]) === -1) { matchMissingAssets = false; break; }
            }
            
            var matchSearch = (cardText.indexOf(query) > -1);
            return (matchStatus && matchProfile && matchAlbumContext && matchHasAssets && matchMissingAssets && matchSearch);
        }
        
        // --- SUB-STEP 10.6.5: MUTATION-PROOF FILTER ENGINE ---
        var activeSortKey = 'none';
        function applySortOrder() {
            activeSortKey = document.getElementById('sortBySelect').value;
            evaluateControlMatrix();
        }
        function evaluateControlMatrix() {
            var q = document.getElementById('searchInput').value.toLowerCase().trim(), prof = document.getElementById('profileSelect').value, ctx = document.getElementById('albumContextSelect').value;
            
            var liveCardsCollection = document.getElementsByClassName('card');
            var staticCardsArray = Array.prototype.slice.call(liveCardsCollection);

            if (activeSortKey !== 'none') {
                var attrName = 'data-earnings-' + activeSortKey.replace('earnings-', '');
                staticCardsArray.sort(function(a, b) {
                    var av = parseFloat(a.getAttribute(attrName)) || 0;
                    var bv = parseFloat(b.getAttribute(attrName)) || 0;
                    return bv - av; // highest earnings first
                });
            }
            
            var visible = 0, gC = document.getElementById('albumGroupsContainer'), cC = document.getElementById('cardsContainer');
            gC.innerHTML = ''; gC.style.display = 'none'; var map = {}; var singles = [];
            
            for (var i = 0; i < staticCardsArray.length; i++) {
                var c = staticCardsArray[i];
                var isMatched = checkCardAgainstActiveMatrixRules(c, q, prof, ctx);
                if (isMatched) {
                    visible++;
                    if (shelfModeActive) {
                        var isAlbumTrack = c.getAttribute('data-is-album') === 'TRUE';
                        if (isAlbumTrack) {
                            var g = c.getAttribute('data-album-group') || 'N/A';
                            if (!map[g]) map[g] = [];
                            map[g].push(c);
                        } else {
                            singles.push(c);
                        }
                    } else if (ctx === 'ALBUM') {
                        var g2 = c.getAttribute('data-album-group') || 'N/A';
                        if (!map[g2]) map[g2] = [];
                        map[g2].push(c);
                    } else {
                        c.style.display = 'flex';
                        cC.appendChild(c);
                    }
                } else { 
                    c.style.display = 'none'; 
                }
            }
            
            if (shelfModeActive && visible > 0) {
                cC.style.display = 'none'; gC.style.display = 'block';
                Object.keys(map).sort().forEach(k => {
                    var sec = document.createElement('div'); sec.className = 'album-group-section';
                    var h = document.createElement('div'); h.className = 'album-group-header'; h.innerHTML = '💿 Album: ' + k + ' <span style=\"font-size:0.8rem; font-weight:500; color:var(--text-muted);\">(' + map[k].length + ' Tracks)</span>'; sec.appendChild(h);
                    map[k].forEach(card => { card.style.display = 'flex'; sec.appendChild(card); }); gC.appendChild(sec);
                });
                if (singles.length > 0) {
                    var singlesSec = document.createElement('div'); singlesSec.className = 'album-group-section singles-section';
                    var sh = document.createElement('div'); sh.className = 'album-group-header'; sh.innerHTML = '🎵 Singles <span style=\"font-size:0.8rem; font-weight:500; color:var(--text-muted);\">(' + singles.length + ' Tracks)</span>'; singlesSec.appendChild(sh);
                    singles.forEach(card => { card.style.display = 'flex'; singlesSec.appendChild(card); }); gC.appendChild(singlesSec);
                }
            } else if (ctx === 'ALBUM' && visible > 0) {
                cC.style.display = 'none'; gC.style.display = 'block';
                Object.keys(map).sort().forEach(k => {
                    var sec = document.createElement('div'); sec.className = 'album-group-section';
                    var h = document.createElement('div'); h.className = 'album-group-header'; h.innerHTML = '💿 Album: ' + k + ' <span style=\"font-size:0.8rem; font-weight:500; color:var(--text-muted);\">(' + map[k].length + ' Tracks)</span>'; sec.appendChild(h);
                    map[k].forEach(card => { card.style.display = 'flex'; sec.appendChild(card); }); gC.appendChild(sec);
                });
            } else { 
                cC.style.display = 'flex'; 
            }
            
            document.getElementById('emptyState').style.display = (visible === 0) ? 'block' : 'none';
            var fL = []; if(activeStatusFilter !== 'ALL') fL.push('<span>Category:</span> ' + ((activeStatusFilter==='MISSING')?'In Queue Gates':activeStatusFilter)); if(q) fL.push('<span>Search:</span> \"'+q+'\"'); if(prof!=='ALL') fL.push('<span>Account:</span> '+prof); if(activeSelectedHasAssets.length) fL.push('<span>Has:</span> '+activeSelectedHasAssets.join(', ')); if(activeSelectedMissingAssets.length) fL.push('<span>Missing:</span> '+activeSelectedMissingAssets.join(', '));
            var pnl = document.getElementById('queryContextPanel'); if(fL.length) { document.getElementById('contextDescription').innerHTML = fL.join(' • '); pnl.style.display = 'flex'; } else pnl.style.display = 'none';
        }
        function exportFilteredSongTitles() {
            var cards = document.getElementsByClassName('card'), q = document.getElementById('searchInput').value.toLowerCase().trim(), prof = document.getElementById('profileSelect').value, ctx = document.getElementById('albumContextSelect').value;
            var lines = [activeStatusFilter + ' Tracks'], map = {}, tot = 0, collected = [];
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (checkCardAgainstActiveMatrixRules(c, q, prof, ctx)) {
                    var title = c.getAttribute('data-title'); tot++;
                    if (ctx === 'ALBUM') { var g = c.getAttribute('data-album-group') || 'N/A'; if(!map[g]) map[g] = []; map[g].push(title); } else { collected.push(title); }
                }
            }
            var payload = lines.join('\n') + '\n\n';
            if (ctx === 'ALBUM') { Object.keys(map).sort().forEach(k => { payload += '💿 Album: ' + k + '\n' + map[k].map(t=>'  - '+t).join('\n') + '\n\n'; }); } else { payload += collected.join('\n'); }
            navigator.clipboard.writeText(payload.trim()).then(() => alert('Exported ' + tot + ' tracks.')).catch(() => alert('Clipboard failed.'));
        }
        toggleViewLayout(localStorage.getItem('dashboard_view_layout') || 'detailed');
var storedShelfPref = localStorage.getItem('dashboard_shelf_mode');
shelfModeActive = (storedShelfPref === null) ? true : (storedShelfPref === '1');
document.getElementById('shelfToggleBtn').innerText = '📁 Album Shelf: ' + (shelfModeActive ? 'ON' : 'OFF');
evaluateControlMatrix(); document.getElementById('btn-all').classList.add('active-filter');

// Offline support: caches this page so the most recently loaded snapshot is viewable with no connection.
// 'serviceWorker' in navigator is false on file:// origins and unsupported browsers, so this silently
// does nothing there rather than throwing - the NAS-opened-locally copy of this same file never attempts
// this, only the GitHub Pages-hosted https:// copy can actually register a service worker at all.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js').catch(function(err) {
            console.warn('Service worker registration failed (offline caching will not be available):', err);
        });
    });
}