import base64, os

def b64(p):
    return 'data:image/png;base64,' + base64.b64encode(open(p,'rb').read()).decode()

IMG = {i: b64(f'mail/s{i}.png') for i in range(1,10)}

# Outlook renders mail with Word: no flex, no grid, most of a stylesheet ignored.
# Everything here is a plain block with inline styles and Calibri, so pasting into a new
# message looks like it was typed there rather than dropped in from somewhere else.
# No wrappers, no cards, no rules — nothing that can paste in as a border.
FONT = "font-family:Calibri,'Segoe UI',Arial,sans-serif"
P    = f"margin:0 0 12px 0;{FONT};font-size:15px;color:#1a1a1a;line-height:1.5"
NOTE = f"margin:0 0 4px 0;{FONT};font-size:15px;color:#b00000;line-height:1.5;font-weight:bold"

STEPS = [
 (1,'Open the SharePoint folder and sign in',
    'MaxSolutions-Mississauga &rarr; Documents &rarr; <b>Daily Morning Dashboard</b>. '
    'Sign in with your <b>work</b> account.', None),
 (2,'Go <i>into</i> the folder',
    'Double-click into it so you can see the files inside. Syncing from the level above '
    'drags down every other folder in Documents.', None),
 (3,'Click <b>Sync</b> in the toolbar',
    'Windows will offer to open OneDrive &mdash; say yes, and sign in again if it asks.', None),
 (4,'Wait for the tick',
    'The OneDrive cloud at the bottom-right of your screen. On a folder this small it takes '
    'seconds.', None),
 (5,'Find it in File Explorer',
    'Left sidebar, under <b>Max Solutions, Inc</b> &mdash; the building icon, not the blue '
    'cloud above it.', None),
 (6,'Right-click the folder &rarr; <b>Always keep on this device</b>',
    'Skip this and Windows keeps your files in the cloud. The dashboard reads them as blank, '
    'and it looks exactly like somebody wiped the morning.',
    'Please don&rsquo;t skip this one.'),
 (7,'Open <b>Morning_Dashboard.html</b> from that folder',
    'Never a copy on your desktop or in Downloads. An old copy saves boxes back empty over '
    'everybody else&rsquo;s.', None),
 (8,'Press <b>Choose folder</b> in the dashboard',
    'Top-left. Pick the same folder you found in step 5. The red bar then goes for good.', None),
 (9,'Chrome asks what it may do &rarr; click <b>Edit files</b>',
    '&ldquo;View files&rdquo; looks like the safe answer. It is not &mdash; the dashboard will '
    'read the morning perfectly and silently refuse to save anything you type.',
    'This is the one that catches everybody.'),
]

def step(n, title, body, flag):
    out  = f'<p style="{P};margin-bottom:4px"><b>{n}. {title}</b></p>'
    out += f'<p style="{P};margin-bottom:8px">{body}</p>'
    if flag:
        out += f'<p style="{NOTE}">{flag}</p>'
    out += (f'<p style="margin:0 0 18px 0"><img src="{IMG[n]}" width="300" '
            f'alt="Step {n}" style="display:block;width:300px;max-width:100%"></p>')
    return out

HTML = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Morning Dashboard — email body</title></head>
<body style="margin:0;padding:26px;background:#ffffff">

<p style="{P}">Hi all,</p>

<p style="{P}">We ran into problems running the morning dashboard from the <b>Z:</b> drive that
could not be fixed on the drive itself. It is why a few mornings went missing, and why some
comments saved and others did not.</p>

<p style="{P}">The dashboard now lives on the <b>Mississauga SharePoint</b>. Same dashboard,
same screen &mdash; better foundation underneath.</p>

<p style="{P}"><b>What I need from you: about two minutes, once, on your own PC.</b> You will not
have to do it again.</p>

{''.join(step(*s) for s in STEPS)}

<p style="{P}"><b>A few other things</b></p>

<p style="{P}"><b>Stop using Z:.</b> Anything saved there from now on will not reach the
meeting.</p>

<p style="{P}"><b>Never keep your own copy of the dashboard.</b> Open it from the SharePoint
folder every time. If you are on an old copy, the page now tells you so in a red bar.</p>

<p style="{P}"><b>If it ever says &ldquo;NOT shared &mdash; saved on this PC only&rdquo;</b>,
nothing is lost &mdash; your morning is still on that machine. Send me a photo of the
message.</p>

<p style="{P}"><b>The boardroom screen is being sorted separately.</b> It needs an account it
does not have yet, so please don&rsquo;t spend time on it.</p>

<p style="{P}">The attached two-page sheet has all of this with a picture for every step &mdash;
worth printing and leaving by the machine.</p>

<p style="{P}">Any trouble, send me a photo of the screen.</p>

<p style="{P}">Thanks,<br>[Your name]</p>

</body></html>'''

open('mail/email_body.html','w',encoding='utf-8').write(HTML)
print('written:', round(os.path.getsize('mail/email_body.html')/1024), 'KB')
