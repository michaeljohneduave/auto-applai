import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16
  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize
    return `${pixelsValue}px`
  })
  const styleElement = document.createElement("style")
  styleElement.textContent = updatedCssText
  return styleElement
}

// Global variables for element selection
let isSelectionMode = false
let highlightedElement: HTMLElement | null = null
let originalStyles: { [key: string]: string } = {}

// Function to clean HTML by removing unnecessary elements
const cleanHtml = (html: string): string => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Remove script tags
  const scripts = doc.querySelectorAll('script')
  scripts.forEach(script => script.remove())
  
  // Remove style tags
  const styles = doc.querySelectorAll('style')
  styles.forEach(style => style.remove())
  
  // Remove link tags (CSS)
  const links = doc.querySelectorAll('link[rel="stylesheet"]')
  links.forEach(link => link.remove())
  
  // Remove meta tags
  const metas = doc.querySelectorAll('meta')
  metas.forEach(meta => meta.remove())
  
  // Remove comments
  const walker = document.createTreeWalker(
    doc,
    NodeFilter.SHOW_COMMENT,
    null
  )
  const comments: Node[] = []
  let node: Node | null
  while (true) {
    node = walker.nextNode()
    if (!node) break
    comments.push(node)
  }
  comments.forEach(comment => {
    if (comment.parentNode) {
      comment.parentNode.removeChild(comment)
    }
  })
  
  // Remove empty elements
  const emptyElements = doc.querySelectorAll('*')
  emptyElements.forEach(el => {
    if (el.children.length === 0 && !el.textContent?.trim()) {
      el.remove()
    }
  })
  
  return doc.documentElement.outerHTML
}

// Function to highlight an element
const highlightElement = (element: HTMLElement) => {
  if (highlightedElement) {
    // Restore original styles
    Object.keys(originalStyles).forEach(property => {
      highlightedElement!.style[property as any] = originalStyles[property]
    })
  }
  
  highlightedElement = element
  originalStyles = {}
  
  // Store original styles
  const computedStyle = window.getComputedStyle(element)
  const propertiesToStore = ['outline', 'outlineOffset', 'backgroundColor', 'border']
  propertiesToStore.forEach(prop => {
    originalStyles[prop] = computedStyle.getPropertyValue(prop)
  })
  
  // Apply highlight styles
  element.style.outline = '3px solid #8b5cf6'
  element.style.outlineOffset = '2px'
  element.style.backgroundColor = 'rgba(139, 92, 246, 0.1)'
  element.style.border = '2px solid #8b5cf6'
}

// Function to clear highlighting
const clearHighlighting = () => {
  if (highlightedElement) {
    Object.keys(originalStyles).forEach(property => {
      highlightedElement!.style[property as any] = originalStyles[property]
    })
    highlightedElement = null
    originalStyles = {}
  }
}

// Function to enable element selection mode
const enableElementSelection = () => {
  isSelectionMode = true
  document.body.style.cursor = 'crosshair'
  
  // Add event listeners
  document.addEventListener('mouseover', handleMouseOver)
  document.addEventListener('mouseout', handleMouseOut)
  document.addEventListener('click', handleElementClick)
  
  // Add escape key listener
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      disableElementSelection()
    }
  }
  document.addEventListener('keydown', handleEscape)
}

// Function to disable element selection mode
const disableElementSelection = () => {
  isSelectionMode = false
  document.body.style.cursor = ''
  clearHighlighting()
  
  // Remove event listeners
  document.removeEventListener('mouseover', handleMouseOver)
  document.removeEventListener('mouseout', handleMouseOut)
  document.removeEventListener('click', handleElementClick)
  
  // Remove escape key listener
  document.removeEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      disableElementSelection()
    }
  })
}

// Mouse over handler for highlighting
const handleMouseOver = (e: MouseEvent) => {
  if (!isSelectionMode) return
  
  const target = e.target as HTMLElement
  if (target && target !== highlightedElement) {
    highlightElement(target)
  }
}

// Mouse out handler
const handleMouseOut = (e: MouseEvent) => {
  if (!isSelectionMode) return
  
  const target = e.target as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement
  
  // Only clear if we're not moving to a child element
  if (!target.contains(relatedTarget)) {
    clearHighlighting()
  }
}

// Click handler for element selection
const handleElementClick = (e: MouseEvent) => {
  if (!isSelectionMode) return
  
  e.preventDefault()
  e.stopPropagation()
  
  const target = e.target as HTMLElement
  if (target) {
    const selectedHtml = cleanHtml(target.outerHTML)
    
    // Send message to background script instead of popup
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      html: selectedHtml,
      url: window.location.href
    })
    
    disableElementSelection()
  }
}

// Function to extract job posting content
const extractJobContent = (): string => {
  const jobSelectors = [
    '[class*="job"]',
    '[class*="position"]',
    '[class*="career"]',
    '[class*="employment"]',
    '[id*="job"]',
    '[id*="position"]',
    '[id*="career"]',
    '[id*="employment"]',
    '.job-description',
    '.job-details',
    '.position-description',
    '.career-details',
    '.employment-details',
    '.job-view-layout',
    '.jobs-description',
    '.jobsearch-JobComponent',
    '.jobsearch-JobComponent-description',
    '.jobDescriptionContent',
    'main',
    'article',
    '.content',
    '.main-content',
    '.page-content'
  ]
  
  let content = ''
  
  for (const selector of jobSelectors) {
    const elements = document.querySelectorAll(selector)
    for (const element of elements) {
      const text = element.textContent?.trim()
      if (text && text.length > 100) {
        content += `${element.outerHTML}\n`
      }
    }
  }
  
  if (!content) {
    const mainContent = document.querySelector('main') || 
                       document.querySelector('article') || 
                       document.querySelector('.content') ||
                       document.querySelector('.main-content')
    
    if (mainContent) {
      content = mainContent.outerHTML
    } else {
      content = document.body.innerHTML
    }
  }
  
  return cleanHtml(content)
}

// Function to extract application forms
const extractApplicationForms = (): string => {
  const formSelectors = [
    'form[action*="apply"]',
    'form[action*="application"]',
    'form[action*="career"]',
    'form[action*="job"]',
    'form[action*="position"]',
    'form[class*="apply"]',
    'form[class*="application"]',
    'form[class*="career"]',
    'form[class*="job"]',
    'form[id*="apply"]',
    'form[id*="application"]',
    'form[id*="career"]',
    'form[id*="job"]',
    'form',
    'a[href*="apply"]',
    'a[href*="application"]',
    'a[href*="career"]',
    'button[onclick*="apply"]',
    'button[onclick*="application"]'
  ]
  
  let forms = ''
  
  for (const selector of formSelectors) {
    try {
      const elements = document.querySelectorAll(selector)
      for (const element of elements) {
        const text = element.textContent?.toLowerCase() || ''
        const href = (element as HTMLAnchorElement).href?.toLowerCase() || ''
        const onclick = (element as HTMLButtonElement).onclick?.toString().toLowerCase() || ''
        
        if (text.includes('apply') || 
            text.includes('application') || 
            text.includes('submit') ||
            href.includes('apply') ||
            href.includes('application') ||
            onclick.includes('apply') ||
            onclick.includes('application')) {
          forms += `${element.outerHTML}\n`
        }
      }
    } catch (error) {
    }
  }
  
  return cleanHtml(forms)
}

// Function to extract apply buttons
const extractApplyButtons = (): string => {
  const applySelectors = [
    'a[href*="apply"]',
    'a[href*="application"]',
    'a[href*="career"]',
    'input[value*="Apply"]',
    'input[value*="Submit"]',
    '[class*="apply"]',
    '[class*="application"]',
    '[id*="apply"]',
    '[id*="application"]'
  ]
  
  let buttons = ''
  
  for (const selector of applySelectors) {
    try {
      const elements = document.querySelectorAll(selector)
      for (const element of elements) {
        const text = element.textContent?.toLowerCase() || ''
        const value = (element as HTMLInputElement).value?.toLowerCase() || ''
        
        if (text.includes('apply') || 
            text.includes('submit') ||
            value.includes('apply') ||
            value.includes('submit')) {
          buttons += `${element.outerHTML}\n`
        }
      }
    } catch (error) {
    }
  }
  
  return cleanHtml(buttons)
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scrapePage') {
    try {
      const jobContent = extractJobContent()
      const applicationForms = extractApplicationForms()
      const applyButtons = extractApplyButtons()
      
      let combinedContent = ''
      
      if (jobContent) {
        combinedContent += `<!-- Job Content -->\n${jobContent}\n\n`
      }
      
      if (applicationForms) {
        combinedContent += `<!-- Application Forms -->\n${applicationForms}\n\n`
      }
      
      if (applyButtons) {
        combinedContent += `<!-- Apply Buttons -->\n${applyButtons}\n\n`
      }
      
      if (!combinedContent) {
        combinedContent = cleanHtml(document.body.innerHTML)
      }
      
      chrome.runtime.sendMessage({
        action: 'pageScraped',
        html: combinedContent,
        url: window.location.href
      })
      
      sendResponse({ success: true })
    } catch (error) {
      console.error('Error scraping page:', error)
      sendResponse({ success: false, error: error.message })
    }
  } else if (message.action === 'enableElementSelection') {
    try {
      enableElementSelection()
      sendResponse({ success: true })
    } catch (error) {
      console.error('Error enabling element selection:', error)
      sendResponse({ success: false, error: error.message })
    }
  }
  
  return true
})

// Cleanup when popup closes
window.addEventListener('beforeunload', () => {
  disableElementSelection()
})

const PlasmoOverlay = () => {
  return null
}

export default PlasmoOverlay
