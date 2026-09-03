/**
 * Email Notification Service
 * Handles email notifications using Resend for landowner submissions and internal alerts
 */

import { Resend } from "resend"

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY || "")

// Email templates
export interface LandownerSubmissionEmailData {
  landownerName: string
  landownerEmail: string
  submissionId: string
  propertyName: string
  propertyAddress: string
  estimatedMonthlyRevenue: number
  landownerShare: number
  recommendations: string[]
}

export interface InternalTeamEmailData {
  submissionId: string
  landownerName: string
  landownerEmail: string
  propertyName: string
  propertyAddress: string
  estimatedCapacity: number
  estimatedMonthlyRevenue: number
  urgency: "HIGH" | "MEDIUM" | "LOW"
}

/**
 * Send confirmation email to landowner after submission
 */
export async function sendLandownerConfirmationEmail(
  data: LandownerSubmissionEmailData
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured, skipping email notification")
      return { success: false, error: "Email service not configured" }
    }

    const subject = `SLOTS Property Submission Received - ${data.propertyName}`
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">SLOTS Smart Parking</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Property Submission Received</h2>
          <p>Dear ${data.landownerName},</p>
          <p>Thank you for your interest in partnering with SLOTS Smart Parking. We have successfully received your property submission.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Submission Details</h3>
            <p><strong>Submission ID:</strong> ${data.submissionId}</p>
            <p><strong>Property Name:</strong> ${data.propertyName}</p>
            <p><strong>Property Address:</strong> ${data.propertyAddress}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Revenue Projections</h3>
            <p><strong>Estimated Monthly Revenue:</strong> ₹${data.estimatedMonthlyRevenue.toLocaleString()}</p>
            <p><strong>Your Estimated Share:</strong> ₹${data.landownerShare.toLocaleString()}</p>
          </div>
          
          ${data.recommendations.length > 0 ? `
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Our Recommendations</h3>
            <ul style="padding-left: 20px;">
              ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
          
          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Our team will review your submission within 24-48 hours</li>
            <li>You will receive a detailed feasibility report</li>
            <li>A representative will contact you to discuss implementation</li>
          </ol>
          
          <p style="color: #666; font-size: 14px;">If you have any questions, please reply to this email or contact us at support@slots.com</p>
        </div>
        
        <div style="background: #333; color: white; padding: 20px; text-align: center;">
          <p style="margin: 0;">© 2024 SLOTS Smart Parking. All rights reserved.</p>
        </div>
      </div>
    `

    const { data: emailData, error } = await resend.emails.send({
      from: "SLOTS Smart Parking <noreply@slots.com>",
      to: data.landownerEmail,
      subject,
      html: htmlContent,
    })

    if (error) {
      console.error("Failed to send landowner confirmation email:", error)
      return { success: false, error: error.message }
    }

    console.log(`✅ Landowner confirmation email sent to ${data.landownerEmail}`)
    return { success: true, messageId: emailData?.id }
  } catch (error: any) {
    console.error("Error sending landowner confirmation email:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Send notification email to internal SLOTS team about new submission
 */
export async function sendInternalTeamNotificationEmail(
  data: InternalTeamEmailData
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured, skipping internal email notification")
      return { success: false, error: "Email service not configured" }
    }

    const teamEmail = process.env.SLOTS_TEAM_EMAIL || "team@slots.com"
    const subject = `[${data.urgency}] New Landowner Submission - ${data.propertyName}`
    
    const urgencyColor = data.urgency === "HIGH" ? "#ef4444" : data.urgency === "MEDIUM" ? "#f59e0b" : "#10b981"
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">SLOTS Internal Team</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <div style="background: ${urgencyColor}; color: white; padding: 10px; border-radius: 4px; text-align: center; margin-bottom: 20px;">
            <strong>${data.urgency} PRIORITY SUBMISSION</strong>
          </div>
          
          <h2 style="color: #333;">New Landowner Submission Received</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Submission Details</h3>
            <p><strong>Submission ID:</strong> ${data.submissionId}</p>
            <p><strong>Landowner Name:</strong> ${data.landownerName}</p>
            <p><strong>Landowner Email:</strong> ${data.landownerEmail}</p>
            <p><strong>Property Name:</strong> ${data.propertyName}</p>
            <p><strong>Property Address:</strong> ${data.propertyAddress}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Business Metrics</h3>
            <p><strong>Estimated Capacity:</strong> ${data.estimatedCapacity} slots</p>
            <p><strong>Estimated Monthly Revenue:</strong> ₹${data.estimatedMonthlyRevenue.toLocaleString()}</p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">Action Required</h3>
            <ol>
              <li>Review submission details in the admin dashboard</li>
              <li>Conduct feasibility analysis</li>
              <li>Contact landowner within 24-48 hours</li>
              <li>Update CRM with lead status</li>
            </ol>
          </div>
          
          <p style="color: #666; font-size: 14px;">This is an automated notification. Please log in to the admin dashboard for more details.</p>
        </div>
        
        <div style="background: #333; color: white; padding: 20px; text-align: center;">
          <p style="margin: 0;">© 2024 SLOTS Smart Parking. Internal Use Only.</p>
        </div>
      </div>
    `

    const { data: emailData, error } = await resend.emails.send({
      from: "SLOTS Internal <noreply@slots.com>",
      to: teamEmail,
      subject,
      html: htmlContent,
    })

    if (error) {
      console.error("Failed to send internal team notification email:", error)
      return { success: false, error: error.message }
    }

    console.log(`✅ Internal team notification email sent to ${teamEmail}`)
    return { success: true, messageId: emailData?.id }
  } catch (error: any) {
    console.error("Error sending internal team notification email:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Send custom email for alerts and notifications
 */
export async function sendCustomEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured, skipping custom email")
      return { success: false, error: "Email service not configured" }
    }

    const { data: emailData, error } = await resend.emails.send({
      from: "SLOTS Smart Parking <noreply@slots.com>",
      to,
      subject,
      html: htmlContent,
    })

    if (error) {
      console.error("Failed to send custom email:", error)
      return { success: false, error: error.message }
    }

    console.log(`✅ Custom email sent to ${to}`)
    return { success: true, messageId: emailData?.id }
  } catch (error: any) {
    console.error("Error sending custom email:", error)
    return { success: false, error: error.message }
  }
}