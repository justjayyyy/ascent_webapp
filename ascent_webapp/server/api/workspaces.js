import connectDB from '../lib/mongodb.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError, unauthorized, notFound } from '../lib/response.js';
import { sendEmail } from '../lib/email-helper.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    await connectDB();
    const user = await authMiddleware(req, res);
    if (!user) return;

    const { method } = req;
    const { id, action } = req.query;

    switch (method) {
      case 'GET':
        if (id) {
          // Get specific workspace
          const workspace = await Workspace.findOne({
            _id: id,
            'members.userId': user._id
          }).lean();

          if (!workspace) {
            return notFound(res, 'Workspace not found or access denied');
          }
          return success(res, workspace);
        } else {
          // List user's workspaces
          const workspaces = await Workspace.find({
            'members.userId': user._id
          }).sort('-createdAt').lean();
          
          return success(res, workspaces);
        }

      case 'POST':
        if (action === 'invite') {
          // Invite member
          if (!id) return error(res, 'Workspace ID required', 400);
          
          const { email, role, permissions } = req.body;
          if (!email) return error(res, 'Email required', 400);

          const workspace = await Workspace.findOne({
            _id: id,
            'members.userId': user._id,
            'members.role': { $in: ['owner', 'admin'] } // Only owners/admins can invite
          });

          if (!workspace) return unauthorized(res, 'Not authorized to invite to this workspace');

          const normalizedEmail = email.toLowerCase().trim();
          
          // Check if already a member
          const existingMember = workspace.members.find(m => m.email === normalizedEmail);
          if (existingMember) {
            return error(res, 'User is already a member or invited', 400);
          }

          // Check if user exists in system
          const invitedUser = await User.findOne({ email: normalizedEmail });

          workspace.members.push({
            userId: invitedUser ? invitedUser._id : null,
            email: normalizedEmail,
            role: role || 'viewer',
            status: 'pending',
            permissions: permissions || {}
          });

          await workspace.save();
          
          // Get the newly added member to get their ID (token)
          const newMember = workspace.members.find(m => m.email === normalizedEmail);
          
          if (newMember) {
            const token = newMember._id;
            const origin = req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
            const inviteLink = `${origin}/accept-invitation/${token}`;
            
            const emailSubject = `Invitation to join ${workspace.name} / הזמנה להצטרף ל-${workspace.name} / Приглашение в ${workspace.name}`;
            const emailBody = `
              Hello / שלום / Здравствуйте,

              You have been invited to join the workspace "${workspace.name}" on Ascent.
              הוזמנת להצטרף לסביבת העבודה "${workspace.name}" ב-Ascent.
              Вас пригласили присоединиться к рабочей области "${workspace.name}" в Ascent.

              Click the link below to accept the invitation:
              לחץ על הקישור למטה כדי לקבל את ההזמנה:
              Нажмите на ссылку ниже, чтобы принять приглашение:
              ${inviteLink}

              If you don't have an account, you will be asked to create one.
              אם אין לך חשבון, תתבקש ליצור אחד.
              Если у вас нет учетной записи, вам будет предложено создать ее.

              Best regards,
              The Ascent Team
              צוות Ascent
              Команда Ascent
            `;
            
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ltr;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h2 style="color: #5C8374;">Ascent</h2>
                </div>
                
                <!-- English -->
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #333; margin-top: 0;">Invitation to join ${workspace.name}</h3>
                  <p>Hello,</p>
                  <p>You have been invited to join the workspace "<strong>${workspace.name}</strong>" on Ascent.</p>
                  <div style="margin: 20px 0;">
                    <a href="${inviteLink}" style="background-color: #5C8374; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Accept Invitation</a>
                  </div>
                  <p style="font-size: 14px; color: #666;">If you don't have an account, you will be asked to create one.</p>
                </div>

                <!-- Hebrew -->
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px; direction: rtl; text-align: right;">
                  <h3 style="color: #333; margin-top: 0;">הזמנה להצטרף ל-${workspace.name}</h3>
                  <p>שלום,</p>
                  <p>הוזמנת להצטרף לסביבת העבודה "<strong>${workspace.name}</strong>" ב-Ascent.</p>
                  <div style="margin: 20px 0;">
                    <a href="${inviteLink}" style="background-color: #5C8374; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">קבל הזמנה</a>
                  </div>
                  <p style="font-size: 14px; color: #666;">אם אין לך חשבון, תתבקש ליצור אחד.</p>
                </div>

                <!-- Russian -->
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <h3 style="color: #333; margin-top: 0;">Приглашение в ${workspace.name}</h3>
                  <p>Здравствуйте,</p>
                  <p>Вас пригласили присоединиться к рабочей области "<strong>${workspace.name}</strong>" в Ascent.</p>
                  <div style="margin: 20px 0;">
                    <a href="${inviteLink}" style="background-color: #5C8374; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Принять приглашение</a>
                  </div>
                  <p style="font-size: 14px; color: #666;">Если у вас нет учетной записи, вам будет предложено создать ее.</p>
                </div>

                <div style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
                  <p>Or copy and paste this link into your browser / או העתק והדבק את הקישור בדפדפן / Или скопируйте ссылку в браузер:</p>
                  <p>${inviteLink}</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p>If you didn't expect this invitation, you can ignore this email.</p>
                </div>
              </div>
            `;

            // Send email asynchronously (don't block response)
            sendEmail({
              to: normalizedEmail,
              subject: emailSubject,
              body: emailBody,
              html: emailHtml
            }).then(result => {
              if (!result.sent) {
                console.error('Failed to send invitation email:', result.error || result.message);
              } else {
                console.log('Invitation email sent to:', normalizedEmail);
              }
            });
          }
          
          return success(res, { message: 'Invitation sent', workspace });
        } else if (action === 'accept') {
            // Accept invitation logic here if needed via POST
            // Usually handled via a separate token-based endpoint or just by logging in if we auto-add
            return error(res, 'Use the invitation link to accept', 400);
        } else {
          // Create new workspace
          const { name } = req.body;
          if (!name) return error(res, 'Workspace name required', 400);

          const workspace = await Workspace.create({
            name,
            ownerId: user._id,
            members: [{
              userId: user._id,
              email: user.email,
              role: 'owner',
              status: 'accepted',
              permissions: {
                viewPortfolio: true,
                editPortfolio: true,
                viewExpenses: true,
                editExpenses: true,
                viewNotes: true,
                editNotes: true,
                viewGoals: true,
                editGoals: true,
                viewBudgets: true,
                editBudgets: true,
                viewSettings: true,
                manageUsers: true
              }
            }]
          });

          return success(res, workspace, 201);
        }

      case 'PUT':
        if (!id) return error(res, 'Workspace ID required', 400);
        
        if (action === 'updateMember') {
           const { memberId } = req.query;
           const { role, permissions } = req.body;
           
           if (!memberId) return error(res, 'Member ID required', 400);

           const workspace = await Workspace.findOne({
             _id: id,
             'members.userId': user._id,
             'members.role': { $in: ['owner', 'admin'] }
           });

           if (!workspace) return unauthorized(res, 'Not authorized');

           const memberIndex = workspace.members.findIndex(m => (m._id && m._id.toString() === memberId) || (m.userId && m.userId.toString() === memberId));
           if (memberIndex === -1) return notFound(res, 'Member not found');

           // Prevent modifying owner
           if (workspace.members[memberIndex].role === 'owner' && workspace.members[memberIndex].userId.toString() !== user._id.toString()) {
             // Only owner can modify themselves? No, owner shouldn't be modified easily.
             // Let's just prevent demoting the last owner.
           }

           if (role) workspace.members[memberIndex].role = role;
           if (permissions) workspace.members[memberIndex].permissions = permissions;

           await workspace.save();
           return success(res, workspace);
        }

        const { name } = req.body;
        
        const updatedWorkspace = await Workspace.findOneAndUpdate(
          { 
            _id: id, 
            'members.userId': user._id,
            'members.role': 'owner' // Only owner can rename for now
          },
          { name },
          { new: true }
        );

        if (!updatedWorkspace) return unauthorized(res, 'Not authorized to update this workspace');
        
        return success(res, updatedWorkspace);

      case 'DELETE':
        if (!id) return error(res, 'Workspace ID required', 400);

        if (action === 'removeMember') {
           const { memberId } = req.query;
           if (!memberId) return error(res, 'Member ID required', 400);

           const workspace = await Workspace.findOne({
             _id: id,
             'members.userId': user._id,
             'members.role': { $in: ['owner', 'admin'] }
           });

           if (!workspace) return unauthorized(res, 'Not authorized');

           // Prevent removing self if owner (must delete workspace instead)
           // Actually, owner can leave if there is another owner.
           
           workspace.members = workspace.members.filter(m => {
             const mId = m._id ? m._id.toString() : (m.userId ? m.userId.toString() : null);
             return mId !== memberId;
           });

           await workspace.save();
           return success(res, workspace);
        }

        // Only owner can delete workspace
        const deletedWorkspace = await Workspace.findOneAndDelete({
          _id: id,
          ownerId: user._id
        });

        if (!deletedWorkspace) return unauthorized(res, 'Not authorized to delete this workspace');

        return success(res, { message: 'Workspace deleted' });

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    return serverError(res, err);
  }
}
