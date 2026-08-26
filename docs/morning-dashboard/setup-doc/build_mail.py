import base64, os

def b64(p):
    return 'data:image/png;base64,' + base64.b64encode(open(p,'rb').read()).decode()

IMG = {f's{i}': b64(f'mail/s{i}.png') for i in range(1,10)}

STEPS = [
 (1,'Open the SharePoint folder and sign in',
    'MaxSolutions-Mississauga &rarr; Documents &rarr; <b>Daily Morning Dashboard</b>. '
    'Use your <b>work</b> account.', False),
 (2,'Go <i>into</i> the folder',
    'Double-click into it so you can see the files. Syncing from the level above drags down '
    'every other folder in Documents.', False),
 (3,'Click <b>Sync</b> in the toolbar',
    'Windows will offer to open OneDrive &mdash; say yes, and sign in again if it asks.', False),
 (4,'Wait for the tick',
    'The OneDrive cloud at the bottom-right of your screen. On a folder this small it takes '
    'seconds.', False),
 (5,'Find it in File Explorer',
    'Left sidebar, under <b>Max Solutions, Inc</b> &mdash; the building icon, not the blue '
    'cloud above it.', False),
 (6,'Right-click the folder &rarr; <b>Always keep on this device</b>',
    'Skip this and Windows keeps your files in the cloud. The dashboard reads them as '
    '<b>blank</b>, and it looks exactly like somebody wiped the morning.', True),
 (7,'Open <b>Morning_Dashboard.html</b> from that folder',
    'Never a copy on your desktop or in Downloads. An old copy saves boxes back empty over '
    'everybody else&rsquo;s.', False),
 (8,'Press <b>Choose folder</b> in the dashboard',
    'Top-left. Pick the same folder you found in step 5. The red bar then goes for good.', False),
 (9,'Chrome asks what it may do &rarr; <b>Edit files</b>',
    '&ldquo;View files&rdquo; looks like the safe answer. It is not &mdash; the dashboard '
    'will read the morning perfectly and <b>silently refuse to save</b> anything you type.', True),
]

def step(n, title, body, warn):
    edge   = '#a4271e' if warn else '#dfe5ec'
    numbg  = '#a4271e' if warn else '#111a2e'
    shade  = '#fdf0ee' if warn else '#ffffff'
    return f'''
<tr><td style="padding:0 0 14px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border:1px solid {edge};background:{shade};border-radius:3px">
  <tr>
   <td width="34" valign="top" style="padding:14px 0 14px 14px">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
       <td width="26" height="26" align="center" valign="middle"
           style="background:{numbg};color:#ffffff;border-radius:13px;font-family:Arial,sans-serif;
                  font-size:14px;font-weight:bold;line-height:26px">{n}</td>
     </tr></table>
   </td>
   <td valign="top" style="padding:14px 16px 14px 12px;font-family:Arial,Helvetica,sans-serif">
     <div style="font-size:15px;font-weight:bold;color:#151c27;line-height:1.35;margin-bottom:4px">{title}</div>
     <div style="font-size:13.5px;color:#4e5a68;line-height:1.5">{body}</div>
     <div style="margin-top:10px">
       <img src="{IMG['s'+str(n)]}" width="234" alt="Step {n}"
            style="display:block;width:234px;max-width:100%;border:1px solid #dfe5ec">
     </div>
   </td>
  </tr>
 </table>
</td></tr>'''

HTML = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Morning Dashboard — revised setup</title></head>
<body style="margin:0;padding:0;background:#eef1f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#eef1f5"><tr><td align="center" style="padding:24px 12px">

<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0"
       style="width:620px;max-width:100%;background:#ffffff;border:1px solid #dfe5ec">

 <tr><td style="background:#111a2e;padding:20px 24px;font-family:Arial,Helvetica,sans-serif">
   <div style="font-size:21px;font-weight:bold;color:#ffffff;line-height:1.2">Morning Dashboard</div>
   <div style="font-size:15px;color:#e0900d;line-height:1.3;margin-top:2px">Revised setup &mdash; it has moved to SharePoint</div>
 </td></tr>

 <tr><td style="padding:22px 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;color:#151c27;line-height:1.55">
   <p style="margin:0 0 12px">Hi all,</p>
   <p style="margin:0 0 12px">We ran into problems running the dashboard from the
     <b>Z:</b> drive that could not be fixed on the drive itself. It is why a few mornings
     went missing, and why some comments saved and others did not.</p>
   <p style="margin:0 0 12px">The dashboard now lives on the <b>Mississauga SharePoint</b>.
     Same dashboard, same screen &mdash; better foundation underneath.</p>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="margin:4px 0 18px;border-left:3px solid #e0900d;background:#fdf5e8">
     <tr><td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#151c27;line-height:1.5">
       <b>What I need from you:</b> about two minutes, once, on your own PC.
       You will not have to do it again.
     </td></tr>
   </table>
 </td></tr>

 <tr><td style="padding:0 24px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
     {''.join(step(*s) for s in STEPS)}
   </table>
 </td></tr>

 <tr><td style="padding:6px 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;color:#151c27;line-height:1.55">
   <div style="font-size:16px;font-weight:bold;margin-bottom:8px">A few other things</div>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#4e5a68;line-height:1.5">
     <tr><td style="padding:0 0 9px">&bull;&nbsp; <b style="color:#151c27">Stop using Z:.</b>
       Anything saved there from now on will not reach the meeting.</td></tr>
     <tr><td style="padding:0 0 9px">&bull;&nbsp; <b style="color:#151c27">Never keep your own copy
       of the dashboard.</b> Open it from the SharePoint folder every time. If you are on an old
       copy the page now tells you so in a red bar.</td></tr>
     <tr><td style="padding:0 0 9px">&bull;&nbsp; <b style="color:#151c27">If it ever says
       &ldquo;NOT shared &mdash; saved on this PC only&rdquo;</b>, nothing is lost &mdash; your
       morning is still on that machine. Send me a photo of the message.</td></tr>
     <tr><td style="padding:0 0 9px">&bull;&nbsp; <b style="color:#151c27">The boardroom screen is
       being sorted separately.</b> It needs an account it does not have yet, so do not spend time
       on it.</td></tr>
   </table>
   <p style="margin:14px 0 12px">The attached two-page sheet has all of this with a picture for
     every step &mdash; worth printing and leaving by the machine.</p>
   <p style="margin:0 0 12px">Any trouble, send me a photo of the screen.</p>
   <p style="margin:0 0 4px">Thanks,<br>[Your name]</p>
 </td></tr>

 <tr><td style="padding:18px 24px 22px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border-top:1px solid #dfe5ec">
     <tr><td style="padding:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8492a1;line-height:1.5">
       The folder: <b style="color:#4e5a68">MaxSolutions-Mississauga &rarr; Documents &rarr; Daily Morning Dashboard</b>.
       No login, nothing to install. Chrome or Edge.
     </td></tr>
   </table>
 </td></tr>

</table>
</td></tr></table>
</body></html>'''

open('mail/email_body.html','w',encoding='utf-8').write(HTML)
print('written:', round(os.path.getsize('mail/email_body.html')/1024), 'KB')
