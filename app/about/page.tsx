"use client"

import { motion } from "framer-motion"
import { Users, Globe, Zap, Shield } from "lucide-react"
import Image from "next/image"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function About() {
  const stats = [
    { value: "120+", label: "Parking Locations in Tamil Nadu" },
    { value: "15,000+", label: "Active Users across TN" },
    { value: "2,00,000+", label: "Bookings Completed" },
    { value: "10+", label: "Cities Covered (Chennai, Madurai, Coimbatore…)" },
  ]

  const team = [
    {
      name: "AMJATH ABBASS",
      role: "Founder & CEO",
      image: "/placeholder.svg?height=300&width=300",
      bio: "Started Smart Parking TN to solve parking challenges in Chennai, especially in T. Nagar and Anna Nagar.",
    },
    {
      name: "MANISHKUMAR",
      role: "CTO",
      image: "/placeholder.svg?height=300&width=300",
      bio: "Heads the technology side, building secure and scalable parking solutions for Tamil Nadu cities.",
    },
    {
      name: "VISVAJEET",
      role: "Head of Operations",
      image: "/placeholder.svg?height=300&width=300",
      bio: "Manages day-to-day parking operations in Chennai, Madurai, and Coimbatore with a strong local team.",
    },
    {
      name: "YUVANESH",
      role: "Head of Marketing",
      image: "/placeholder.svg?height=300&width=300",
      bio: "Leads marketing and community outreach, ensuring Smart Parking reaches every corner of Tamil Nadu.",
    },
  ]

  const values = [
    {
      icon: Zap,
      title: "Innovation",
      description: "We innovate to provide Tamil Nadu with the best real-time smart parking solutions.",
    },
    {
      icon: Shield,
      title: "Reliability",
      description: "From Chennai to Coimbatore, our platform ensures secure and reliable parking services.",
    },
    {
      icon: Users,
      title: "Customer-Centric",
      description: "Drivers in TN cities are at the heart of everything we do, from design to support.",
    },
    {
      icon: Globe,
      title: "Sustainability",
      description:
        "We help reduce traffic congestion in TN by optimizing parking and cutting down unnecessary vehicle movement.",
    },
  ]

  return (
    <div className="pt-16 min-h-screen bg-black">
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-gray-900 to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-indigo-600 text-transparent bg-clip-text mb-6">
              About SLOTS
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              We're on a mission to revolutionize the parking experience in Tamil Nadu through technology and innovation.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-2xl md:text-3xl font-bold mb-6">Our Story</h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  Founded in 2024 in Chennai, SLOTS was born out of a local frustration: the struggle
                  to find parking in areas like T. Nagar, Pondy Bazaar, and R.S. Puram.
                </p>
                <p>
                  What started as a simple idea has grown into a smart platform that connects drivers with real-time
                  available parking spots across TN cities. Today, we serve thousands of users from Chennai to Madurai.
                </p>
                <p>
                  Our passionate Tamil Nadu team of engineers and parking experts are committed to making parking easier,
                  stress-free, and eco-friendly for every driver.
                </p>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="relative flex items-center justify-center min-h-[400px]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-600 rounded-xl blur-xl opacity-20 transform scale-105"></div>
              <SLOTSLogo size="large" className="relative z-10 scale-[2] md:scale-[2.5]" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-indigo-600 text-transparent bg-clip-text mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-indigo-600 text-transparent bg-clip-text mb-4">
              Our Values
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              These core values guide everything we do at SLOTS.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gray-900 rounded-xl p-6 border border-gray-800"
              >
                <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center mb-4">
                  <value.icon className="h-6 w-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                <p className="text-gray-400">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-indigo-600 text-transparent bg-clip-text mb-4">
              Meet Our Team
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              The passionate Tamil Nadu team behind SLOTS.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700"
              >
                <Image
                  src={member.image || "/placeholder.svg"}
                  alt={member.name}
                  width={300}
                  height={300}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-1">{member.name}</h3>
                  <p className="text-indigo-400 mb-4">{member.role}</p>
                  <p className="text-gray-400">{member.bio}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-gray-400">
            <p>@2026 SLOTS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
