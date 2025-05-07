// Make this file a module by adding an export
export {};

interface Point {
    x: number;
    y: number;
}

// Add interface for generated image data
interface GeneratedImage {
    id: string;
    url: string;
    width: number;
    height: number;
}

// Add interface for draggable image
interface DragImage {
    url: string;
    element: HTMLImageElement;
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
}

// Add interface for placed images on canvas
interface PlacedImage {
    id: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    selected: boolean;
    originalAspectRatio?: number; // Store original aspect ratio for resizing
}

// Add resize handle positions enum
enum ResizeHandle {
    None = 'none',
    TopLeft = 'nw-resize',
    TopRight = 'ne-resize',
    BottomLeft = 'sw-resize',
    BottomRight = 'se-resize',
    Top = 'n-resize',
    Right = 'e-resize',
    Bottom = 's-resize',
    Left = 'w-resize'
}

declare const html2canvas: any;

// Add type declaration for Konva
declare const Konva: any;

// Add type declaration for jsPDF
declare global {
    interface Window {
        jspdf: {
            jsPDF: new (options: any) => any;
        };
    }
}

class DrawingApp {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isDrawing: boolean = false;
    private currentTool: string = 'pencil';
    private currentColor: string = '#000000';
    private currentSize: number = 16;
    private startPoint: Point = { x: 0, y: 0 };
    private canvasState: ImageData | null = null;
    private documentName: string = 'Untitled Document';
    private isStroke: boolean = true;
    private textInput: HTMLDivElement;
    private textInputContainer: HTMLDivElement;
    private currentTextPosition: Point | null = null;
    private imagePromptInput: HTMLInputElement;
    private reimagineFileInput: HTMLInputElement | null = null;
    private reimaginePreview: HTMLImageElement | null = null;
    private loadingIndicator: HTMLElement;
    private thumbnailsContainer: HTMLElement;
    private generatedImages: GeneratedImage[] = [];
    private selectedImageIndex: number = -1;
    private currentDragImage: DragImage | null = null;
    private placedImages: PlacedImage[] = [];
    private selectedImageId: string | null = null;
    private isDraggingPlacedImage: boolean = false;
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private isResizingImage: boolean = false;
    private currentResizeHandle: ResizeHandle = ResizeHandle.None;
    private resizeStartPoint: Point | null = null;
    private resizeStartDimensions: { x: number, y: number, width: number, height: number } | null = null;
    private readonly HANDLE_SIZE: number = 10; // Size of resize handles
    private _navigationEventsAttached: boolean = false;

    // Konva related properties
    private stage: any; // Konva.Stage
    private backgroundLayer: any; // Konva.Layer - For regular canvas content
    private shapeLayer: any; // Konva.Layer - For shapes
    private activeShape: any = null; // Current shape being drawn
    private transformer: any = null; // Transformer for shapes
    private drawingPoints: number[] = []; // Store points for pencil drawing

    // Add properties for canvas navigation
    private isNavigationMode: boolean = false;
    private virtualCanvasWidth: number = 3000;
    private virtualCanvasHeight: number = 3000;

    constructor() {
        this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.textInput = document.getElementById('text-input') as HTMLDivElement;
        this.textInputContainer = document.getElementById('text-input-container') as HTMLDivElement;
        this.imagePromptInput = document.getElementById('image-prompt') as HTMLInputElement;
        this.loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;
        this.thumbnailsContainer = document.getElementById('image-thumbnails-container') as HTMLElement;
        this.currentSize = 16; // Set default size to 16px

        // Ensure text input is properly set up
        if (!this.textInput || !this.textInputContainer) {
            console.error('Text input elements not found');
            return;
        }

        this.initializeCanvas();
        this.initializeKonva();
        this.addEventListeners();
        this.initializeDocumentName();
        this.initializeMenu();
        this.initializeKonvaTextInput();
        this.initializeTextToImage();
        this.initializeReimagine();
        this.initializeTooltips();
        this.initializeDragEvents();

        // Add key event listener for delete functionality
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Initialize delete button for selected images
        this.initializeDeleteButton();
    }

    private initializeKonva(): void {
        // Get the dimensions from the canvas
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Create a Konva stage in the canvas container (replacing the canvas)
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error('Canvas container not found');
            return;
        }

        // Hide the original canvas as we'll use Konva instead
        this.canvas.style.display = 'none';

        // Create Konva stage with same dimensions as canvas
        this.stage = new Konva.Stage({
            container: 'canvas-container',
            width: width,
            height: height,
            draggable: false // Start in drawing mode, not navigation mode
        });

        // Create layers
        this.backgroundLayer = new Konva.Layer();
        this.shapeLayer = new Konva.Layer();

        // Add layers to stage
        this.stage.add(this.backgroundLayer);
        this.stage.add(this.shapeLayer);

        // Initialize transformer for resizing/moving shapes
        this.transformer = new Konva.Transformer({
            nodes: [],
            enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            rotateEnabled: false
        });
        this.shapeLayer.add(this.transformer);
        
        // Add boundary limit for dragging the canvas
        this.stage.on('dragmove', () => {
            this.limitDragBoundaries();
        });
        
        // Flag to track navigation events
        this._navigationEventsAttached = false;
    }

    private initializeKonvaTextInput(): void {
        // We'll handle text directly with Konva.Text instead of HTML contenteditable
        this.textInput.style.display = 'none';
        this.textInputContainer.style.display = 'none';
    }

    private initializeDeleteButton(): void {
        // Create a floating delete button that appears when an image is selected
        const deleteButton = document.createElement('button');
        deleteButton.id = 'delete-image-btn';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = 'Delete selected image';
        deleteButton.className = 'delete-image-btn';
        deleteButton.style.display = 'none';
        
        // Add to canvas container
        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(deleteButton);
            
            // Add click event
            deleteButton.addEventListener('click', () => {
                this.deleteSelectedImage();
            });
        }
    }

    private initializeDocumentName(): void {
        const documentNameElement = document.getElementById('document-name');
        if (!documentNameElement) {
            console.error('Document name element not found');
            return;
        }

        // Initialize modal elements
        const modal = document.getElementById('rename-modal') as HTMLElement;
        const nameInput = document.getElementById('document-name-input') as HTMLInputElement;
        const confirmButton = document.getElementById('rename-confirm') as HTMLButtonElement;
        const cancelButton = document.getElementById('rename-cancel') as HTMLButtonElement;
        const closeButton = document.querySelector('.close-modal') as HTMLElement;

        if (!modal || !nameInput || !confirmButton || !cancelButton || !closeButton) {
            console.error('Modal elements not found');
            return;
        }

        // Set initial document name
        documentNameElement.textContent = this.documentName;

        // Show modal when document name is clicked
        documentNameElement.addEventListener('click', () => {
            nameInput.value = this.documentName;
            modal.style.display = 'flex';
            nameInput.focus();
            nameInput.select();
        });

        // Handle rename confirmation
        const renameDocument = () => {
            const newName = nameInput.value.trim();
            if (newName) {
                this.documentName = newName;
                documentNameElement.textContent = newName;
            }
            modal.style.display = 'none';
        };

        // Attach event listeners
        confirmButton.addEventListener('click', renameDocument);
        
        // Close modal on cancel
        cancelButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Close modal with X button
        closeButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Handle Enter key in input
        nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                renameDocument();
            }
        });
    }

    private initializeCanvas(): void {
        const updateCanvasSize = () => {
            const container = document.getElementById('canvas-container');
            if (!container) return;
            
            const rect = container.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            // If Konva stage is initialized, update its size too
            if (this.stage) {
                this.stage.width(rect.width);
                this.stage.height(rect.height);
                
                // Center the view initially in the virtual canvas
                if (!this.stage.x() && !this.stage.y()) {
                    const offsetX = (this.virtualCanvasWidth - rect.width) / 2;
                    const offsetY = (this.virtualCanvasHeight - rect.height) / 2;
                    this.stage.position({
                        x: -offsetX,
                        y: -offsetY
                    });
                }
            }
        };
        
        // Set canvas size initially
        updateCanvasSize();
        
        // Update canvas size when window is resized
        window.addEventListener('resize', updateCanvasSize);
    }

    private addEventListeners(): void {
        // Tool buttons
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(button => {
            button.addEventListener('click', () => {
                toolButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.currentTool = button.id;
                
                // Toggle navigation mode when navigation tool is selected
                if (button.id === 'navigation') {
                    this.toggleNavigationMode(true);
                } else {
                    this.toggleNavigationMode(false);
                    
                    // Deselect any selected shapes when changing tools
                    if (this.transformer) {
                        this.transformer.nodes([]);
                        this.shapeLayer.draw();
                    }
                }
            });
        });

        // Color and size controls
        const colorInput = document.getElementById('color') as HTMLInputElement;
        const sizeInput = document.getElementById('size') as HTMLInputElement;
        const sizeValue = document.getElementById('size-value') as HTMLSpanElement;

        colorInput.addEventListener('input', e => {
            this.currentColor = (e.target as HTMLInputElement).value;
        });

        sizeInput.addEventListener('input', e => {
            this.currentSize = parseInt((e.target as HTMLInputElement).value);
            sizeValue.textContent = this.currentSize.toString();
            this.textInput.style.fontSize = `${this.currentSize}px`;
        });

        // Clear button
        const clearButton = document.getElementById('clear');
        if (clearButton) {
            clearButton.addEventListener('click', () => this.clearCanvas());
        }

        // Add double-click handler for text creation
        this.stage.on('dblclick', (e: any) => {
            // Only create new text if:
            // 1. Text tool is selected
            // 2. User clicked on empty space (not on existing text or other shape)
            // 3. Not in navigation mode
            if (this.currentTool === 'text' && e.target === this.stage && !this.isNavigationMode) {
                this.createText(e);
            }
        });



        // Canvas events for drawing and shape creation
        this.stage.on('mousedown touchstart', (e: any) => {
            // Prevent default only for touch events to avoid scrolling issues
            if (e.evt.type.includes('touch')) {
                e.evt.preventDefault();
            }
            
            // Skip if in navigation mode - allow dragging
            if (this.isNavigationMode) {
                return;
            }
            
            // Check if we clicked on an existing shape
            const clickedOnShape = e.target !== this.stage;
            if (clickedOnShape) {
                // If we clicked on a shape, handle selection
                if (e.target.hasName('shape') || e.target.hasName('text')) {
                    // Get pointer position
                    const pos = this.stage.getPointerPosition();
                    
                    // Use Konva's getIntersection which returns the topmost shape
                    // This correctly handles Z-index and returns the shape that should receive the click
                    const topShape = this.stage.getIntersection(pos);
                    
                    if (topShape && (topShape.hasName('shape') || topShape.hasName('text'))) {
                        this.transformer.nodes([topShape]);
                        this.shapeLayer.draw();
                    } else {
                        // Fallback to original behavior
                        this.transformer.nodes([e.target]);
                        this.shapeLayer.draw();
                    }
                }
            } else {
                // We clicked on empty canvas, start a new shape or drawing
                this.startDrawing(e);
            }
        });

        this.stage.on('mousemove touchmove', (e: any) => {
            if (e.evt.type.includes('touch')) {
                e.evt.preventDefault();
            }
            
            // Skip if in navigation mode
            if (!this.isNavigationMode) {
                this.draw(e);
            }
        });

        this.stage.on('mouseup touchend', (e: any) => {
            // If not in navigation mode, handle drawing stop
            if (!this.isNavigationMode) {
                this.stopDrawing(e);
            }
        });

        // Disable context menu on stage
        this.stage.on('contextmenu', (e: any) => {
            e.evt.preventDefault();
        });
    }

    private initializeMenu(): void {
        const menuButton = document.getElementById('menu-button');
        const menuDropdown = document.getElementById('menu-dropdown');
        const savePdfButton = document.getElementById('save-pdf');

        if (!menuButton || !menuDropdown || !savePdfButton) {
            console.error('Menu elements not found');
            return;
        }

        // Toggle menu dropdown
        menuButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event from bubbling to document
            menuDropdown.classList.toggle('active');
            
            // Log for debugging
            console.log('Menu clicked, dropdown is now:', menuDropdown.classList.contains('active') ? 'visible' : 'hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuButton.contains(e.target as Node) && !menuDropdown.contains(e.target as Node)) {
                menuDropdown.classList.remove('active');
            }
        });

        // Handle save as PDF
        savePdfButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event from bubbling
            console.log('Save as PDF clicked');
            this.exportToPDF();
            menuDropdown.classList.remove('active');
        });
    }

    private exportToPDF(): void {
        console.log('Exporting to PDF...');
        
        if (!window.jspdf) {
            console.error('jsPDF not loaded');
            alert('PDF export library not loaded. Please try again later.');
            return;
        }

        try {
            // Create a clone of the stage for export to avoid modifying the original
            const clonedStage = this.stage.clone();
            
            // Add a white background rectangle to the cloned stage
            const backgroundRect = new Konva.Rect({
                x: 0,
                y: 0,
                width: clonedStage.width(),
                height: clonedStage.height(),
                fill: 'white',
                listening: false
            });
            
            // Insert the background as the first element in the first layer
            const firstLayer = clonedStage.getLayers()[0];
            firstLayer.add(backgroundRect);
            backgroundRect.moveToBottom();
            
            // Convert cloned stage with background to data URL
            const dataURL = clonedStage.toDataURL({ 
                pixelRatio: 2, // Higher quality
                mimeType: 'image/png', // Use PNG instead of JPEG for better quality
                quality: 1
            });
            
            // Create image element from data URL
            const img = new Image();
            img.src = dataURL;
            
            img.onload = () => {
                console.log('Image loaded, creating PDF...');
                
                const pdf = new window.jspdf.jsPDF({
                    orientation: 'landscape',
                    unit: 'px',
                    format: [this.stage.width(), this.stage.height()]
                });

                // Calculate the maximum dimensions that fit on the PDF
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const widthRatio = pdfWidth / img.width;
                const heightRatio = pdfHeight / img.height;
                const ratio = Math.min(widthRatio, heightRatio);
                
                const canvasWidth = img.width * ratio;
                const canvasHeight = img.height * ratio;
                
                const marginX = (pdfWidth - canvasWidth) / 2;
                const marginY = (pdfHeight - canvasHeight) / 2;
                
                // Add image to PDF
                pdf.addImage(img, 'PNG', marginX, marginY, canvasWidth, canvasHeight);
                
                // Download PDF
                pdf.save(`${this.documentName}.pdf`);
                console.log('PDF generated and downloaded');
            };
            
            img.onerror = (error) => {
                console.error('Error loading image for PDF:', error);
                alert('Failed to generate PDF. Please try again.');
            };
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            alert('Failed to export as PDF. Please try again.');
        }
    }

    private initializeTextToImage(): void {
        // Add event listener to generate images when Enter is pressed in prompt input
        if (this.imagePromptInput) {
        this.imagePromptInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                const prompt = this.imagePromptInput.value.trim();
                if (prompt) {
                        this.generateMockImages(prompt);
                        // Clear input after generating
                        this.imagePromptInput.value = '';
                }
            }
        });
        }
    }
    
    private initializeReimagine(): void {
        // Get the sidebar element
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('Sidebar not found');
            return;
        }
        
        // Move the Clear Canvas button to the bottom of the sidebar
        const clearButton = document.querySelector('.clear-btn');
        if (clearButton && clearButton.parentNode === sidebar) {
            // We'll remove it here and add it back later as the last element
            sidebar.removeChild(clearButton);
        }
        
        // Remove the current loading indicator from its location
        if (this.loadingIndicator && this.loadingIndicator.parentNode) {
            this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
        }
        
        // Create reimagine section
        const reimagineSection = document.createElement('div');
        reimagineSection.className = 'tool-group reimagine-section';
        
        // Create heading
        const heading = document.createElement('h3');
        heading.textContent = 'Re-Imagine';
        heading.style.fontStyle = 'italic';
        reimagineSection.appendChild(heading);
        
        // Create description
        const description = document.createElement('p');
        description.className = 'section-description';
        description.textContent = 'Upload an image to Reimagine';
        //reimagineSection.appendChild(description);
        
        // Create file input container
        const fileInputContainer = document.createElement('div');
        fileInputContainer.className = 'reimagine-upload-container';
        
        // Create file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'reimagine-file-input';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none'; // Hide the actual input
        this.reimagineFileInput = fileInput;
        fileInputContainer.appendChild(fileInput);
        
        // Create custom upload button
        const uploadButton = document.createElement('button');
        uploadButton.className = 'tool-btn upload-button';
        uploadButton.textContent = 'Select Image';
        uploadButton.setAttribute('data-tooltip', 'Upload an image to Reimagine'); // Added tooltip using data-tooltip
        uploadButton.addEventListener('click', () => {
            if (this.reimagineFileInput) {
                this.reimagineFileInput.click();
            }
        });
        fileInputContainer.appendChild(uploadButton);
        
        reimagineSection.appendChild(fileInputContainer);
        
        // Create preview container
        const previewContainer = document.createElement('div');
        previewContainer.className = 'reimagine-preview-container';
        
        // Create image preview
        const previewImg = document.createElement('img');
        previewImg.className = 'reimagine-preview';
        previewImg.style.display = 'none';
        previewImg.alt = 'Preview';
        this.reimaginePreview = previewImg;
        previewContainer.appendChild(previewImg);
        
        // Add a placeholder message when no image is selected
        const placeholderText = document.createElement('span');
        placeholderText.className = 'preview-placeholder';
        placeholderText.textContent = 'Image preview';
        placeholderText.style.color = '#6c757d';
        placeholderText.style.fontSize = '0.85rem';
        previewContainer.appendChild(placeholderText);
        
        reimagineSection.appendChild(previewContainer);
        
        // Create reimagine button
        const reimagineButton = document.createElement('button');
        reimagineButton.className = 'tool-btn reimagine-button';
        reimagineButton.textContent = 'Reimagine';
        reimagineButton.disabled = true;
        reimagineButton.addEventListener('click', () => {
            this.reimagineImage();
        });
        reimagineSection.appendChild(reimagineButton);
        
        // Find the Text to Image section
        const textToImageGroup = Array.from(sidebar.querySelectorAll('.tool-group'))
            .find(group => {
                const heading = group.querySelector('h3');
                return heading && heading.textContent === 'Text to Image';
            });
        
        // Create a divider to add between sections
        const divider = document.createElement('div');
        divider.className = 'section-divider';
        
        // Add divider and Reimagine section to the sidebar
        if (textToImageGroup) {
            // Add section divider after Text to Image section
            sidebar.insertBefore(divider, textToImageGroup.nextSibling);
            
            // Add Reimagine section after the divider
            sidebar.insertBefore(reimagineSection, divider.nextSibling);
        } else {
            // If we can't find the Text to Image section, just append to the end
            sidebar.appendChild(reimagineSection);
        }

        const divider1 = document.createElement('div');
                divider1.className = 'section-divider';
                divider1.id = 'reimagine-variations-divider1';
                divider1.style.display = 'block';
                divider1.style.height = '2px';
                divider1.style.backgroundColor = '#9d7db1';
                divider1.style.width = '100%';
                divider1.style.margin = '10px 0';

        const divider2 = document.createElement('div');
                divider2.className = 'section-divider';
                divider2.id = 'reimagine-variations-divider2';
                divider2.style.display = 'block';
                divider2.style.height = '2px';
                divider2.style.backgroundColor = '#9d7db1';
                divider2.style.width = '100%';
                divider2.style.margin = '10px 0';
        
        // Add the thumbnails container after Reimagine section
        if (this.thumbnailsContainer) {
            // Create thumbnails wrapper for proper spacing
            const thumbnailsWrapper = document.createElement('div');
            thumbnailsWrapper.className = 'thumbnails-wrapper';
            thumbnailsWrapper.style.margin = '15px 0';
            
            // Add a label for thumbnails
            const thumbnailsLabel = document.createElement('h4');
            thumbnailsLabel.textContent = 'Generated Variations';
            thumbnailsLabel.style.fontSize = '0.9rem';
            thumbnailsLabel.style.marginBottom = '10px';
            thumbnailsLabel.style.fontStyle = 'italic';
            thumbnailsWrapper.appendChild(thumbnailsLabel);
            
            // Add thumbnails container
            thumbnailsWrapper.appendChild(this.thumbnailsContainer);
            
            // Create a new loading indicator under the thumbnails container
            const newLoadingIndicator = document.createElement('div');
            newLoadingIndicator.id = 'loading-indicator';
            newLoadingIndicator.textContent = 'Generating...';
            newLoadingIndicator.style.display = 'none';
            newLoadingIndicator.style.textAlign = 'center';
            newLoadingIndicator.style.padding = '10px';
            newLoadingIndicator.style.fontStyle = 'italic';
            newLoadingIndicator.style.color = '#666';
            
            // Add the new loading indicator to the thumbnails wrapper
            thumbnailsWrapper.appendChild(newLoadingIndicator);
            
            // Update the reference to the loading indicator
            this.loadingIndicator = newLoadingIndicator;
            
            // Add after Reimagine section
            //sidebar.insertBefore(thumbnailsWrapper, reimagineSection.nextSibling);

            
                sidebar.insertBefore(divider1, reimagineSection.nextSibling);

                sidebar.insertBefore(thumbnailsWrapper, divider1.nextSibling);

                
                sidebar.insertBefore(divider2, thumbnailsWrapper.nextSibling);
        }
        
        // Now add back the Clear Canvas button as the last element in the sidebar
        if (clearButton) {
            sidebar.appendChild(clearButton);
            sidebar.insertBefore(clearButton as Node, divider2.nextSibling);
        }
        
        // Handle file input change
        if (this.reimagineFileInput) {
            this.reimagineFileInput.addEventListener('change', (e: Event) => {
                const input = e.target as HTMLInputElement;
                if (input.files && input.files[0] && this.reimaginePreview) {
                    const file = input.files[0];
                    
                    // Preview the selected image
                    const reader = new FileReader();
                    reader.onload = (e: ProgressEvent<FileReader>) => {
                        if (e.target && e.target.result && this.reimaginePreview) {
                            this.reimaginePreview.src = e.target.result as string;
                            this.reimaginePreview.style.display = 'block';
                            
                            // Hide the placeholder text
                            const placeholder = previewContainer.querySelector('.preview-placeholder');
                            if (placeholder) {
                                (placeholder as HTMLElement).style.display = 'none';
                            }
                            
                            // Enable the reimagine button
                            reimagineButton.disabled = false;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }
    
    private async reimagineImage(): Promise<void> {
        try {
            if (!this.reimagineFileInput || !this.reimagineFileInput.files || !this.reimagineFileInput.files[0]) {
                console.error('No image selected for reimagining');
                return;
            }
            
            // Show loading indicator
            this.loadingIndicator.style.display = 'block';
            
            // Clear previous thumbnails
            this.thumbnailsContainer.innerHTML = '';
            this.generatedImages = [];
            
            // Clipdrop API key
            const API_KEY = "29c00b461157ce41ce6d7a8c683c5b20815691ee24b3e2687058a01e7cd0ed2f9c466ed0bb985f041a833fa7c5abfce9";
            
            console.log("Attempting to reimagine image using Clipdrop API");
            
            // Resize the image if needed (max 1024x1024)
            const resizedFile = await this.resizeImageFile(this.reimagineFileInput.files[0], 1024, 1024);
            
            // Create FormData for the request
            const formData = new FormData();
            formData.append('image_file', resizedFile);
            
            try {
                // Send request to our proxy for the first variation
                const response1 = await fetch("http://localhost:3000/proxy/reimagine", {
                    method: "POST",
                    headers: {
                        "x-api-key": API_KEY
                    },
                    body: formData
                });
                
                if (!response1.ok) {
                    const errorData = await response1.json();
                    throw new Error(`API request failed: ${response1.status} - ${errorData.details || errorData.error}`);
                }
                
                const responseData1 = await response1.json();
                
                if (!responseData1.success || !responseData1.image) {
                    throw new Error("No image returned from API");
                }
                
                // Create an array to hold the generated images
                const images: GeneratedImage[] = [];
                
                // Add the first variation
                const imageUrl1 = `data:image/png;base64,${responseData1.image}`;
                images.push({
                    id: "1",
                    url: imageUrl1,
                    width: 512,
                    height: 512
                });
                
                // Request second variation
                console.log("Requesting second variation...");
                const response2 = await fetch("http://localhost:3000/proxy/reimagine", {
                    method: "POST",
                    headers: {
                        "x-api-key": API_KEY
                    },
                    body: formData
                });
                
                if (response2.ok) {
                    const data2 = await response2.json();
                    if (data2.success && data2.image) {
                        images.push({
                            id: "2",
                            url: `data:image/png;base64,${data2.image}`,
                            width: 512,
                            height: 512
                        });
                    }
                }
                
                // Request third variation
                console.log("Requesting third variation...");
                const response3 = await fetch("http://localhost:3000/proxy/reimagine", {
                    method: "POST",
                    headers: {
                        "x-api-key": API_KEY
                    },
                    body: formData
                });
                
                if (response3.ok) {
                    const data3 = await response3.json();
                    if (data3.success && data3.image) {
                        images.push({
                            id: "3",
                            url: `data:image/png;base64,${data3.image}`,
                            width: 512,
                            height: 512
                        });
                    }
                }
                
                // Update the generatedImages array and display thumbnails
                this.generatedImages = images;
                this.displayThumbnails();
                
            } catch (apiError) {
                console.error("API error:", apiError);
                // Show the error to the user
                const errorMessage = apiError instanceof Error 
                    ? apiError.message 
                    : "Unknown API error occurred";
                alert(`Error: ${errorMessage}`);
                
                // As a fallback, generate mock images
                this.generateMockImages("Reimagined image");
            }
            
        } catch (error) {
            console.error('Error reimagining image:', error);
            alert('Failed to reimagine image. Please try again.');
        } finally {
            // Hide loading indicator
            this.loadingIndicator.style.display = 'none';
        }
    }
    
    // Helper method to resize image using canvas
    private resizeImageFile(file: File, maxWidth: number, maxHeight: number): Promise<File> {
        return new Promise((resolve, reject) => {
            // Create a FileReader to read the image file
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                // Create an image element to load the image
                const img = new Image();
                img.onload = () => {
                    // Get current dimensions
                    let width = img.width;
                    let height = img.height;
                    
                    // If image is already small enough, return the original file
                    if (width <= maxWidth && height <= maxHeight) {
                        console.log('Image already within size limits:', width, 'x', height);
                        return resolve(file);
                    }
                    
                    // Calculate new dimensions
                    if (width > height && width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                    
                    console.log(`Resizing image from ${img.width}x${img.height} to ${width}x${height}`);
                    
                    // Create a canvas to draw the resized image
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Draw the image on the canvas with the new dimensions
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        return reject(new Error('Could not get canvas context'));
                    }
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert canvas to blob with the original file type
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            return reject(new Error('Failed to create blob from canvas'));
                        }
                        
                        // Create a new File from the blob
                        const resizedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: file.lastModified
                        });
                        
                        resolve(resizedFile);
                    }, file.type);
                };
                
                img.onerror = () => {
                    reject(new Error('Failed to load image for resizing'));
                };
                
                // Set the source of the image to the reader result
                if (readerEvent.target && typeof readerEvent.target.result === 'string') {
                    img.src = readerEvent.target.result;
                } else {
                    reject(new Error('Failed to read image file'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read image file'));
            };
            
            // Read the image file as a data URL
            reader.readAsDataURL(file);
        });
    }
    
    private async generateImages(prompt: string): Promise<void> {
        try {
            // Show loading indicator
            this.loadingIndicator.style.display = 'block';
            
            // Clear previous thumbnails
            this.thumbnailsContainer.innerHTML = '';
            this.generatedImages = [];
            
            // Call image generation API via our local proxy server
            try {
                // Clipdrop API key
                const API_KEY = "29c00b461157ce41ce6d7a8c683c5b20815691ee24b3e2687058a01e7cd0ed2f9c466ed0bb985f041a833fa7c5abfce9";
                
                // Check if proxy server is available
                const useProxy = true; // Toggle this if you want to switch between proxy and mock images
                
                if (useProxy) {
                    console.log("Attempting to generate images using Clipdrop API with prompt:", prompt);
                    
                    // Create FormData for the request
                    const formData = new FormData();
                    formData.append('prompt', prompt);
                    
                    // Send request to our proxy
                    const response = await fetch("http://localhost:3000/proxy/generate", {
                        method: "POST",
                        headers: {
                            "x-api-key": API_KEY
                        },
                        body: formData
                    });
                    
                    // Get the response body as text first for diagnosis
                    const responseText = await response.text();
                    console.log("Raw API response text:", responseText);
                    
                    // Try to parse as JSON
                    let responseData;
                    try {
                        responseData = JSON.parse(responseText);
                        console.log("Parsed response data:", Object.keys(responseData));
                    } catch (parseError) {
                        console.error("Failed to parse response as JSON:", parseError);
                        throw new Error(`API returned invalid JSON: ${responseText}`);
                    }
                    
                    // Check if the response was an error
                    if (!response.ok || responseData.error) {
                        const errorMessage = responseData.error || `API request failed: ${response.status}`;
                        console.error("API error:", errorMessage);
                        throw new Error(errorMessage);
                    }
                    
                    // Check if we got the expected image
                    if (!responseData.success || !responseData.image) {
                        console.error("No image in response:", responseData);
                        throw new Error("No image returned from API");
                    }
                    
                    console.log("Successfully received image from Clipdrop API");
                    
                    // Create image objects - Clipdrop only returns one image per request
                    // We'll request three times if multiple images are needed
                    const images: GeneratedImage[] = [];
                    
                    // Add the first image
                    const imageUrl = `data:image/png;base64,${responseData.image}`;
                    images.push({
                        id: "1",
                        url: imageUrl,
                        width: 512,
                        height: 512
                    });
                    
                    // Generate two more images if needed
                    if (this.generatedImages.length < 3) {
                        try {
                            // Request second image
                            console.log("Requesting second image...");
                            const response2 = await fetch("http://localhost:3000/proxy/generate", {
                                method: "POST",
                                headers: {
                                    "x-api-key": API_KEY
                                },
                                body: formData
                            });
                            
                            if (response2.ok) {
                                const data2 = await response2.json();
                                if (data2.success && data2.image) {
                                    images.push({
                                        id: "2",
                                        url: `data:image/png;base64,${data2.image}`,
                                        width: 512,
                                        height: 512
                                    });
                                }
                            }
                            
                            // Request third image
                            console.log("Requesting third image...");
                            const response3 = await fetch("http://localhost:3000/proxy/generate", {
                                method: "POST",
                                headers: {
                                    "x-api-key": API_KEY
                                },
                                body: formData
                            });
                            
                            if (response3.ok) {
                                const data3 = await response3.json();
                                if (data3.success && data3.image) {
                                    images.push({
                                        id: "3",
                                        url: `data:image/png;base64,${data3.image}`,
                                        width: 512,
                                        height: 512
                                    });
                                }
                            }
                        } catch (additionalError) {
                            console.error("Error generating additional images:", additionalError);
                            // Continue with the images we have
                        }
                    }
                    
                    this.generatedImages = images;
                    this.displayThumbnails();
                } else {
                    // Fallback to mock images
                    console.log("Using mock images");
                    this.generateMockImages(prompt);
                }
                
            } catch (apiError: unknown) {
                console.error("API error:", apiError);
                // Show the error to the user
                const errorMessage = apiError instanceof Error 
                    ? apiError.message 
                    : "Unknown API error occurred";
                alert(`Error: ${errorMessage}`);
                // Fallback to local generation if API fails
                this.generateMockImages(prompt);
            }
            
        } catch (error) {
            console.error('Error generating images:', error);
            alert('Failed to generate images. Please try again.');
        } finally {
            // Hide loading indicator
            this.loadingIndicator.style.display = 'none';
        }
    }
    
    private generateMockImages(prompt: string): void {
        console.log("Using mock images with prompt:", prompt);
        
        // Create 3 mock generated images with different colors and improved visuals
        const colors = [
            { bg: '#f5e1e5', text: '#8c212a' }, // Red theme
            { bg: '#e1f5e1', text: '#1e5e1e' }, // Green theme
            { bg: '#e1e1f5', text: '#1e1e5e' }  // Blue theme
        ];
        
        const mockImages = colors.map((color, index) => ({
            id: (index + 1).toString(),
            url: this.createAdvancedMockImage(512, 512, color.bg, color.text, prompt, index + 1),
            width: 512, 
            height: 512
        }));
        
        this.generatedImages = mockImages;
        this.displayThumbnails();
    }
    
    private createAdvancedMockImage(width: number, height: number, bgColor: string, textColor: string, prompt: string, imageNumber: number): string {
        // Create an offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        // Fill with gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, bgColor);
        gradient.addColorStop(1, this.adjustColor(bgColor, -20));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Add a frame
        ctx.strokeStyle = this.adjustColor(bgColor, -40);
        ctx.lineWidth = 10;
        ctx.strokeRect(15, 15, width - 30, height - 30);
        
        // Add placeholder image pattern
        ctx.fillStyle = this.adjustColor(bgColor, -10);
        
        // Draw some shapes to make it look like an image
        for (let i = 0; i < 5; i++) {
            const x = 50 + Math.random() * (width - 100);
            const y = 100 + Math.random() * (height - 200);
            const radius = 30 + Math.random() * 70;
            
            ctx.globalAlpha = 0.4 + Math.random() * 0.3;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
        
        // Add prompt as title
        ctx.fillStyle = textColor;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Truncate long prompts
        let displayPrompt = prompt;
        if (displayPrompt.length > 50) {
            displayPrompt = displayPrompt.substring(0, 47) + '...';
        }
        
        ctx.fillText(displayPrompt, width / 2, 30);
        
        // Add image number
        ctx.font = 'bold 80px Arial';
        ctx.globalAlpha = 0.15;
        ctx.fillText(`#${imageNumber}`, width / 2, height / 2 - 40);
        ctx.globalAlpha = 1;
        
        // Add mock image label
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Mock Image (API unavailable - CORS issue)', width / 2, height - 20);
        
        // Return data URL
        return canvas.toDataURL('image/png');
    }
    
    private adjustColor(color: string, amount: number): string {
        // Helper to darken/lighten colors
        const clamp = (val: number) => Math.min(255, Math.max(0, val));
        
        // Convert hex to rgb
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Adjust and convert back to hex
        const newR = clamp(r + amount);
        const newG = clamp(g + amount);
        const newB = clamp(b + amount);
        
        // Fix for older JavaScript versions that don't support padStart
        const padZero = (str: string): string => {
            return str.length < 2 ? '0' + str : str;
        };
        
        return `#${padZero(newR.toString(16))}${padZero(newG.toString(16))}${padZero(newB.toString(16))}`;
    }
    
    private displayThumbnails(): void {
        // Clear container
        this.thumbnailsContainer.innerHTML = '';
        
        // Create thumbnail for each image
        this.generatedImages.forEach((image, index) => {
            // Create thumbnail container
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.className = 'thumbnail-container';
            
            // Create loading indicator for the thumbnail
            const loader = document.createElement('div');
            loader.className = 'thumbnail-loader';
            loader.textContent = 'Loading...';
            thumbnailContainer.appendChild(loader);
            
            // Create the thumbnail image
            const thumbnail = document.createElement('img');
            thumbnail.alt = `Generated image ${index + 1}`;
            thumbnail.className = 'image-thumbnail';
            thumbnail.dataset.index = index.toString();
            
            // Show loader until image is loaded
            thumbnail.style.display = 'none';
            
            // Add double-click event for direct placement
            thumbnail.addEventListener('dblclick', () => {
                // Mark as selected
                this.selectImage(index);
                
                // Get the canvas center coordinates
                const canvasCenter = {
                    x: this.canvas.width / 2,
                    y: this.canvas.height / 2
                };
                
                // Place image directly at canvas center
                const selectedImage = this.generatedImages[index];
                if (selectedImage) {
                    this.placeImageOnCanvas(selectedImage.url, canvasCenter);
                    
                    // Reset to pencil tool
                    setTimeout(() => {
                        this.currentTool = 'pencil';
                        const pencilBtn = document.getElementById('pencil');
                        if (pencilBtn) {
                            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
                            pencilBtn.classList.add('active');
                        }
                    }, 100);
                }
            });
            
            // Add load event to hide loader when image loads
            thumbnail.addEventListener('load', () => {
                loader.style.display = 'none';
                thumbnail.style.display = 'block';
            });
            
            // Add error event to show error message if image fails to load
            thumbnail.addEventListener('error', () => {
                loader.style.display = 'none';
                thumbnailContainer.innerHTML = '<div class="thumbnail-error">Error loading image</div>';
            });
            
            // Set the image source last to trigger loading
            thumbnail.src = image.url;
            
            thumbnailContainer.appendChild(thumbnail);
            this.thumbnailsContainer.appendChild(thumbnailContainer);
        });
        
        // If no images were generated, show a message
        if (this.generatedImages.length === 0) {
            const message = document.createElement('div');
            message.className = 'thumbnail-message';
            message.textContent = 'No images generated. Try a different prompt.';
            this.thumbnailsContainer.appendChild(message);
        }
    }
    
    private selectImage(index: number): void {
        // Update selected image
        this.selectedImageIndex = index;
        
        // Update thumbnail UI
        document.querySelectorAll('.image-thumbnail').forEach((thumb, idx) => {
            if (idx === index) {
                thumb.classList.add('selected');
            } else {
                thumb.classList.remove('selected');
            }
        });
        
        // Set tool to 'image' (custom tool for placing images)
        this.currentTool = 'image';
        
        // Remove active class from all tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    }

    private startDrawing(e: any): void {
        // When starting to draw, deselect any selected shapes
        this.transformer.nodes([]);
        this.shapeLayer.draw();
        
        // Skip text tool in startDrawing, it's handled by double-click now
        if (this.currentTool === 'text') {
            return;
        }
        
        // For shape drawing tools
        this.isDrawing = true;
        const pos = this.stage.getPointerPosition();
        this.startPoint = { x: pos.x, y: pos.y };

        if (this.currentTool === 'circle' || this.currentTool === 'rectangle' || this.currentTool === 'square') {
            // Create shape based on current tool
            if (this.currentTool === 'circle') {
                this.activeShape = new Konva.Ellipse({
                    x: pos.x,
                    y: pos.y,
                    radiusX: 0,
                    radiusY: 0,
                    stroke: this.currentColor,
                    strokeWidth: this.currentSize,
                    draggable: true,
                    name: 'shape'
                });
            } else if (this.currentTool === 'rectangle' || this.currentTool === 'square') {
                this.activeShape = new Konva.Rect({
                    x: pos.x,
                    y: pos.y,
                    width: 0,
                    height: 0,
                    stroke: this.currentColor,
                    strokeWidth: this.currentSize,
                    draggable: true,
                    name: 'shape'
                });
            }
            
            if (this.activeShape) {
                this.shapeLayer.add(this.activeShape);
            }
        } else if (this.currentTool === 'pencil') {
            // Enhanced pencil tool with Konva features
            
            // Store drawing points for simplification
            this.drawingPoints = [pos.x, pos.y, pos.x, pos.y]; // Start with duplicate points to have a visible dot
            
            // Create a Konva.Line for freehand drawing with enhanced settings
            this.activeShape = new Konva.Line({
                points: this.drawingPoints,
                stroke: this.currentColor,
                strokeWidth: this.currentSize,
                lineCap: 'round',
                lineJoin: 'round',
                tension: 0.5, // Controls curve smoothness (0-1)
                globalCompositeOperation: 'source-over',
                name: 'shape',
                draggable: true,
                perfectDrawEnabled: false, // Performance optimization
                listening: false // Disable events during drawing for better performance
            });
            
            // Add lines to shapeLayer instead of backgroundLayer for proper dragging
            this.shapeLayer.add(this.activeShape);
        } else if (this.currentTool === 'eraser') {
            // For eraser, we'll create a line that acts as an eraser
            this.activeShape = new Konva.Line({
                points: [pos.x, pos.y],
                stroke: 'white', // Use canvas background color
                strokeWidth: this.currentSize,
                lineCap: 'round',
                lineJoin: 'round',
                tension: 0.5,
                globalCompositeOperation: 'destination-out',
                name: 'eraser',
                perfectDrawEnabled: false // Performance optimization
            });
            this.shapeLayer.add(this.activeShape);
        }
    }

    private draw(e: any): void {
        if (!this.isDrawing || !this.activeShape) return;
        
        const pos = this.stage.getPointerPosition();
        
        if (this.currentTool === 'pencil') {
            // For drawing tools, add points to the line with performance optimizations
            
            // Add the new point to our drawing points array
            // No need to slice or limit points while drawing - keep all points
            this.drawingPoints.push(pos.x, pos.y);
            
            // Update the shape with all captured points
            this.activeShape.points(this.drawingPoints);
            
            // Use batchDraw for better performance
            this.shapeLayer.batchDraw();
        } else if (this.currentTool === 'circle') {
            // For circle, calculate radius based on mouse position
            const dx = pos.x - this.startPoint.x;
            const dy = pos.y - this.startPoint.y;
            this.activeShape.position({
                x: this.startPoint.x,
                y: this.startPoint.y
            });
            this.activeShape.radiusX(Math.abs(dx));
            this.activeShape.radiusY(Math.abs(dy));
            this.shapeLayer.batchDraw();
        } else if (this.currentTool === 'rectangle') {
            // For rectangle, update width and height
            const dx = pos.x - this.startPoint.x;
            const dy = pos.y - this.startPoint.y;
            this.activeShape.position({
                x: dx < 0 ? pos.x : this.startPoint.x,
                y: dy < 0 ? pos.y : this.startPoint.y
            });
            this.activeShape.width(Math.abs(dx));
            this.activeShape.height(Math.abs(dy));
            this.shapeLayer.batchDraw();
        } else if (this.currentTool === 'square') {
            // For square, ensure width and height are equal
            const dx = pos.x - this.startPoint.x;
            const dy = pos.y - this.startPoint.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            
            this.activeShape.position({
                x: dx < 0 ? this.startPoint.x - size : this.startPoint.x,
                y: dy < 0 ? this.startPoint.y - size : this.startPoint.y
            });
            this.activeShape.width(size);
            this.activeShape.height(size);
            this.shapeLayer.batchDraw();
        }
    }

    private stopDrawing(e: any): void {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (!this.activeShape) return;
        
        // Clean up zero-sized shapes
        if ((this.currentTool === 'circle' && this.activeShape.radiusX() === 0 && this.activeShape.radiusY() === 0) ||
            ((this.currentTool === 'rectangle' || this.currentTool === 'square') && 
             (this.activeShape.width() === 0 || this.activeShape.height() === 0))) {
            this.activeShape.destroy();
        } else if (this.currentTool === 'pencil') {
            // For pencil, we might want to simplify the path for better performance
            // Enable events now that drawing is complete
            this.activeShape.listening(true);
            
            // Set additional properties to ensure proper dragging
            this.activeShape.draggable(true);
            
            // Reset drawing points array
            this.drawingPoints = [];
            
            // Select the shape for manipulation if it's not tiny
            if (this.activeShape.points().length > 4) { // At least two points
                this.transformer.nodes([this.activeShape]);
            }
        } else if (this.currentTool !== 'eraser') {
            // Select the shape for immediate manipulation (except for eraser)
            this.transformer.nodes([this.activeShape]);
        }
        
        // Draw the layers
        this.shapeLayer.batchDraw();
        
        this.activeShape = null;
    }

    private clearCanvas(): void {
        // Clear all layers
        this.shapeLayer.destroyChildren();
        
        // Re-add transformer to shape layer
        this.transformer = new Konva.Transformer({
            nodes: [],
            enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            rotateEnabled: false
        });
        this.shapeLayer.add(this.transformer);
        
        // Redraw layers
        this.shapeLayer.draw();
    }

    private handleKeyDown(e: KeyboardEvent): void {
        // Check if we're currently editing text (if a textarea exists in the DOM)
        const isEditingText = document.querySelector('textarea') !== null;
        if (isEditingText) {
            // Don't handle delete keys when editing text
                return;
        }
        
        // Delete selected shapes on Delete or Backspace keys
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.transformer.nodes().length > 0) {
            // Get selected nodes
            const selectedNodes = this.transformer.nodes();
            
            // Remove each selected node
            selectedNodes.forEach((node: any) => {
                node.destroy();
            });
            
            // Clear transformer selection
            this.transformer.nodes([]);
            
            // Redraw layers
            this.shapeLayer.draw();
        }
    }

    private deleteSelectedImage(): void {
        if (this.selectedImageId) {
            // Remove image from placedImages array
            this.placedImages = this.placedImages.filter(img => img.id !== this.selectedImageId);
            this.selectedImageId = null;
            
            // Hide delete button
            const deleteButton = document.getElementById('delete-image-btn');
            if (deleteButton) {
                deleteButton.style.display = 'none';
            }
            
            // Redraw canvas
            this.redrawCanvas();
        }
    }

    private redrawCanvas(): void {
        // This method might need adjustments based on how images are handled with Konva
        // For now, keeping it simple
        this.shapeLayer.draw();
    }

    private placeImageOnCanvas(imageUrl: string, position: Point): void {
        // Check if image is in cache
        let img: HTMLImageElement;
        
        const placeImage = () => {
            // Calculate size to maintain aspect ratio
            const maxSize = 300;
            const aspectRatio = img.naturalWidth / img.naturalHeight;
            let width = maxSize;
            let height = maxSize / aspectRatio;
            
            if (height > maxSize) {
                height = maxSize;
                width = maxSize * aspectRatio;
            }
            
            // Calculate placement position (centered on click point)
            const x = position.x - width/2;
            const y = position.y - height/2;
            
            // Add to placed images array with unique ID
            const newId = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const placedImage: PlacedImage = {
                id: newId,
                url: imageUrl,
                x: x,
                y: y,
                width: width,
                height: height,
                selected: false
            };
            
            this.placedImages.push(placedImage);
            console.log('Added image via placeImageOnCanvas. Count:', this.placedImages.length);
            
            // Draw image on canvas
            this.ctx.drawImage(img, x, y, width, height);
        };
        
        if (this.imageCache.has(imageUrl)) {
            img = this.imageCache.get(imageUrl)!;
            placeImage();
        } else {
            img = new Image();
            
            img.onload = () => {
                this.imageCache.set(imageUrl, img);
                placeImage();
            };
            
            img.onerror = () => {
                console.error('Error loading image');
                alert('Failed to load the selected image. Please try again.');
            };
            
            img.src = imageUrl;
        }
    }

    private initializeDragEvents(): void {
        // Add event listeners for drag and drop
        this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            this.handleDrag(e);
            this.updateCursor(e);
        });
        this.canvas.addEventListener('mouseup', this.finalizeDrag.bind(this));
        
        // Prevent dragging from canceling when mouse leaves canvas
        this.canvas.addEventListener('mouseleave', (e: MouseEvent) => {
            // Only finalize if mouse is actually leaving the canvas area
            const rect = this.canvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || 
                e.clientY < rect.top || e.clientY > rect.bottom) {
                this.finalizeDrag(e);
            }
        });
    }
    
    private handleDrag(e: MouseEvent): void {
        if (!this.currentDragImage || !this.currentDragImage.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.currentDragImage.offsetX;
        const y = e.clientY - rect.top - this.currentDragImage.offsetY;
        
        // Update drag image position
        this.currentDragImage.element.style.left = `${x}px`;
        this.currentDragImage.element.style.top = `${y}px`;
    }
    
    private finalizeDrag(e: MouseEvent): void {
        if (!this.currentDragImage) return;
        
        // Reset canvas cursor
        this.canvas.classList.remove('image-placement');
        
        if (this.currentDragImage.isDragging) {
            // Get final position
            const rect = this.canvas.getBoundingClientRect();
            const finalPosition = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            console.log('Finalizing drag at position', finalPosition);
            
            // Save the currentDragImage data before potentially nullifying it
            const dragImageData = {
                url: this.currentDragImage.url,
                width: parseInt(this.currentDragImage.element.style.width) || 300,
                height: parseInt(this.currentDragImage.element.style.height) || 300
            };
            
            // Clean up visual drag element
            if (this.currentDragImage.element.parentNode) {
                this.currentDragImage.element.parentNode.removeChild(this.currentDragImage.element);
            }
            
            // Check if image is already in cache
            let img: HTMLImageElement;
            const loadAndPlaceImage = () => {
                // Calculate actual placement position (centered on cursor)
                const width = dragImageData.width;
                const height = dragImageData.height;
                const x = finalPosition.x - width/2;
                const y = finalPosition.y - height/2;
                
                console.log('Final image position', x, y, width, height);
                
                // Add to placed images array with unique ID
                const newId = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                const placedImage: PlacedImage = {
                    id: newId,
                    url: dragImageData.url,
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    selected: false
                };
                
                this.placedImages.push(placedImage);
                console.log('Added image to placedImages array. Count:', this.placedImages.length);
                
                // Draw on canvas using cached image
                this.ctx.drawImage(img, x, y, width, height);
                
                // Reset to pencil tool
                this.currentTool = 'pencil';
                const pencilBtn = document.getElementById('pencil');
                if (pencilBtn) {
                    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
                    pencilBtn.classList.add('active');
                }
            };
            
            if (this.imageCache.has(dragImageData.url)) {
                img = this.imageCache.get(dragImageData.url)!;
                loadAndPlaceImage();
            } else {
                img = new Image();
                img.onload = () => {
                    this.imageCache.set(dragImageData.url, img);
                    loadAndPlaceImage();
                };
                
                img.onerror = () => {
                    console.error('Error loading image in finalizeDrag:', dragImageData.url);
                    alert('Failed to load the selected image. Please try again.');
                };
                
                img.src = dragImageData.url;
            }
        } else {
            // Clean up visual drag element if not dragging
            if (this.currentDragImage.element.parentNode) {
                this.currentDragImage.element.parentNode.removeChild(this.currentDragImage.element);
            }
        }
        
        // Reset drag state after handling everything
        this.currentDragImage = null;
    }
    
    private startDraggableImage(imageUrl: string, startPoint: Point): void {
        // Create a draggable image element
        const container = document.getElementById('canvas-container');
        if (!container) return;
        
        // Change canvas cursor
        this.canvas.classList.add('image-placement');
        
        // Create image element for dragging
        const dragImg = document.createElement('img');
        dragImg.src = imageUrl;
        dragImg.className = 'draggable-image';
        dragImg.style.position = 'absolute';
        dragImg.style.pointerEvents = 'none';
        dragImg.style.opacity = '0.8';
        dragImg.style.cursor = 'move';
        
        // Calculate max dimensions
        const maxSize = 300;
        
        // Set initial size (will be updated when image loads)
        dragImg.style.width = `${maxSize}px`;
        dragImg.style.maxWidth = `${maxSize}px`;
        
        // Position at mouse point
        dragImg.style.left = `${startPoint.x - maxSize/2}px`;
        dragImg.style.top = `${startPoint.y - maxSize/2}px`;
        
        // Add to container
        container.appendChild(dragImg);
        
        // Create drag image state
        this.currentDragImage = {
            url: imageUrl,
            element: dragImg,
            isDragging: true,
            offsetX: maxSize/2,
            offsetY: maxSize/2
        };
        
        // Update size when image loads
        dragImg.onload = () => {
            if (!this.currentDragImage) return;
            
            // Calculate dimensions based on aspect ratio
            const aspectRatio = dragImg.naturalWidth / dragImg.naturalHeight;
            let width = maxSize;
            let height = maxSize / aspectRatio;
            
            if (height > maxSize) {
                height = maxSize;
                width = maxSize * aspectRatio;
            }
            
            // Update element
            this.currentDragImage.element.style.width = `${width}px`;
            this.currentDragImage.element.style.height = `${height}px`;
            
            // Update offset
            this.currentDragImage.offsetX = width/2;
            this.currentDragImage.offsetY = height/2;
            
            // Update position to center on cursor
            const rect = this.canvas.getBoundingClientRect();
            const boundingRect = container.getBoundingClientRect();
            const x = startPoint.x - width/2;
            const y = startPoint.y - height/2;
            
            this.currentDragImage.element.style.left = `${x}px`;
            this.currentDragImage.element.style.top = `${y}px`;
        };
    }
    
    private selectImageAt(x: number, y: number): boolean {
        console.log('Testing point', x, y, 'against', this.placedImages.length, 'images');
        
        // Check if point is inside any placed image - check in reverse order so top-most is selected first
        for (let i = this.placedImages.length - 1; i >= 0; i--) {
            const img = this.placedImages[i];
            
            console.log('Checking image', i, img.x, img.y, img.width, img.height);
            
            if (
                x >= img.x && 
                x <= img.x + img.width && 
                y >= img.y && 
                y <= img.y + img.height
            ) {
                console.log('Image selected:', i);
                
                // Deselect all images
                this.placedImages.forEach(image => {
                    image.selected = false;
                });
                
                // Select this image
                img.selected = true;
                this.selectedImageId = img.id;
                
                // Move the selected image to the end of the array so it's rendered on top
                this.placedImages = [
                    ...this.placedImages.filter(image => image.id !== img.id),
                    img
                ];
                
                // Calculate drag offset
                this.dragOffsetX = x - img.x;
                this.dragOffsetY = y - img.y;
                
                // Clear any thumbnail selection when a canvas image is selected
                this.selectedImageIndex = -1;
                
                // Reset currentTool to prevent thumbnail image placement when moving placed images
                this.currentTool = 'select';
                
                // Redraw canvas
                this.redrawCanvas();
                return true;
            }
        }
        
        console.log('No image found at point');
        // No image found at this position
        return false;
    }
    
    private deselectAllImages(): void {
        this.placedImages.forEach(img => {
            img.selected = false;
        });
        this.selectedImageId = null;
        
        // Hide delete button
        const deleteButton = document.getElementById('delete-image-btn');
        if (deleteButton) {
            deleteButton.style.display = 'none';
        }
        
        // Redraw canvas
        this.redrawCanvas();
    }

    private initializeTooltips(): void {
        // Get all elements with data-tooltip attribute
        const tooltipElements = document.querySelectorAll('[data-tooltip]');
        
        // Add mouseover event to position tooltip correctly
        tooltipElements.forEach(element => {
            element.addEventListener('mouseover', (e: Event) => {
                const target = e.currentTarget as HTMLElement;
                if (!target || !target.dataset.tooltip) return;
                
                // Create or get tooltip element
                let tooltip = document.querySelector('.custom-tooltip') as HTMLElement;
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.className = 'custom-tooltip';
                    document.body.appendChild(tooltip);
                }
                
                // Set tooltip content and position
                tooltip.textContent = target.dataset.tooltip;
                tooltip.style.display = 'block';
                
                // Calculate position
                const rect = target.getBoundingClientRect();
                
                // Position based on element type/class
                if (target.closest('.tool-btn') || target.closest('.style-options')) {
                    tooltip.style.left = `${rect.right + 10}px`;
                    tooltip.style.top = `${rect.top + rect.height/2}px`;
                } else if (target.closest('.color-picker') || target.closest('.size-picker')) {
                    tooltip.style.left = `${rect.left + rect.width/2}px`;
                    tooltip.style.top = `${rect.top}px`;
                } else if (target.id === 'menu-button') {
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.bottom + 10}px`;
                } else {
                    tooltip.style.left = `${rect.right + 10}px`;
                    tooltip.style.top = `${rect.top}px`;
                }
            });
            
            element.addEventListener('mouseout', () => {
                const tooltip = document.querySelector('.custom-tooltip') as HTMLElement;
                if (tooltip) {
                    tooltip.style.display = 'none';
                }
            });
        });
    }

    private updateCursor(e: MouseEvent): void {
        // This is now handled by Konva's built-in cursor management
        // But we'll keep this method for compatibility with other code that might call it
    }

    // Helper method for creating text on double-click
    private createText(e: any): void {
        // Create text element at click position
        const pos = this.stage.getPointerPosition();
        const text = new Konva.Text({
            x: pos.x,
            y: pos.y,
            text: 'Double-click to edit',
            fontSize: this.currentSize,
            fill: this.currentColor,
            draggable: true,
            name: 'text',
            width: 200,
            wrap: 'word',
            padding: 5
        });
        
        // Enable text editing on double click
        text.on('dblclick', () => {
            // Create a textarea over the text
            const textPosition = text.absolutePosition();
            const stageContainer = this.stage.container();
            
            const textarea = document.createElement('textarea');
            stageContainer.appendChild(textarea);
            
            textarea.value = text.text();
            textarea.style.position = 'absolute';
            textarea.style.top = textPosition.y + 'px';
            textarea.style.left = textPosition.x + 'px';
            textarea.style.width = Math.max(text.width(), 200) + 'px'; // Minimum width of 200px
            textarea.style.height = Math.max(text.height(), 50) + 'px'; // Minimum height
            textarea.style.fontSize = text.fontSize() + 'px';
            textarea.style.border = 'none';
            textarea.style.padding = '5px'; // Add padding for better text visibility
            textarea.style.margin = '0px';
            textarea.style.overflow = 'hidden';
            textarea.style.background = 'rgba(255, 255, 255, 0.7)'; // Semi-transparent background
            textarea.style.outline = 'none';
            textarea.style.resize = 'both'; // Allow manual resizing
            textarea.style.lineHeight = text.lineHeight().toString();
            textarea.style.fontFamily = text.fontFamily();
            textarea.style.transformOrigin = 'left top';
            textarea.style.color = text.fill();
            textarea.style.boxSizing = 'border-box'; // Include padding in width/height calculations
            textarea.style.whiteSpace = 'pre-wrap'; // Support line breaks and wrapping
            textarea.wrap = 'soft'; // Enable word wrapping
            
            textarea.focus();
            
            const removeTextarea = () => {
                stageContainer.removeChild(textarea);
                window.removeEventListener('click', handleOutsideClick);
                text.show();
                this.shapeLayer.draw();
            };
            
            // Update textarea size based on content
            const updateTextareaSize = () => {
                // Create a hidden div to measure text width and height accurately
                const measurer = document.createElement('div');
                measurer.style.position = 'absolute';
                measurer.style.visibility = 'hidden';
                measurer.style.fontSize = textarea.style.fontSize;
                measurer.style.fontFamily = textarea.style.fontFamily;
                measurer.style.lineHeight = textarea.style.lineHeight;
                measurer.style.whiteSpace = 'pre-wrap'; // Handle line breaks properly
                measurer.style.boxSizing = 'border-box';
                measurer.style.padding = textarea.style.padding;
                // Don't constrain the width - let it fit to content naturally
                measurer.style.display = 'inline-block';
                measurer.style.maxWidth = 'none';
                measurer.style.wordBreak = 'break-word'; // Break words to prevent overflow
                measurer.style.textAlign = 'left'; // Ensure left alignment
                
                // Replace spaces with non-breaking spaces to preserve them
                // Replace newlines with <br> for proper measurement
                const textWithLineBreaks = textarea.value
                    .replace(/ /g, '\u00A0')
                    .replace(/\n/g, '<br>');
                
                measurer.innerHTML = textWithLineBreaks || 'M'; // Use 'M' as minimum if empty
                
                document.body.appendChild(measurer);
                
                // Add padding to the measurements
                const padding = 10; // 5px padding on each side
                
                // Get accurate measurements of the actual text content
                const measuredWidth = measurer.offsetWidth;
                const measuredHeight = measurer.offsetHeight;
                
                // Store original position
                const originalPosition = text.absolutePosition();
                
                // Set width based on content (with padding)
                const width = Math.max(measuredWidth + padding, 200);
                
                // Set height based on content (with padding)
                const height = Math.max(measuredHeight + padding, 50);
                
                // Update text dimensions first
                text.width(width);
                text.height(height);
                
                // Important: Restore the original position
                text.absolutePosition(originalPosition);
                
                // Now update textarea dimensions and position to match
                textarea.style.width = width + 'px';
                textarea.style.height = height + 'px';
                textarea.style.top = originalPosition.y + 'px';
                textarea.style.left = originalPosition.x + 'px';
                
                // Enable text wrapping in the Konva Text node
                text.wrap('word');
                
                // Clean up
                document.body.removeChild(measurer);
            };
            
            // Update text value when textarea changes
            textarea.addEventListener('input', () => {
                // Update the Konva text node with the new content
                text.text(textarea.value);
                
                // Adjust size to fit new content
                updateTextareaSize();
            });
            
            // Initial size update
            updateTextareaSize();
            
            // Handle various events to finalize editing
            const handleOutsideClick = (e: Event) => {
                if (e.target !== textarea) {
                    text.text(textarea.value);
                    removeTextarea();
                }
            };
            
            textarea.addEventListener('keydown', (e) => {
                // Prevent the Enter keydown event from propagating to window
                e.stopPropagation();
                
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); // Prevent default Enter behavior
                    
                    // Make sure to update the text before hiding the textarea
                    const updatedText = textarea.value;
                    text.text(updatedText);
                    
                    // Only remove the textarea after text is updated
                    setTimeout(() => {
                        removeTextarea();
                    }, 0);
                }
                if (e.key === 'Escape') {
                    removeTextarea();
                }
            });
            
            textarea.addEventListener('blur', () => {
                // Make sure to update the text before hiding the textarea
                text.text(textarea.value);
                removeTextarea();
            });
            
            // Hide the text node while editing
            text.hide();
            this.shapeLayer.draw();
            
            setTimeout(() => {
                window.addEventListener('click', handleOutsideClick);
            }, 0);
        });
        
        // Add text to shape layer
        this.shapeLayer.add(text);
        this.shapeLayer.draw();
        
        // Select the text for immediate manipulation
        this.transformer.nodes([text]);
        this.shapeLayer.draw();
        
        // Show the textarea immediately for editing
        setTimeout(() => {
            text.fire('dblclick');
        }, 50);
    }

    public toggleNavigationMode(enabled: boolean): void {
        this.isNavigationMode = enabled;
        this.stage.draggable(enabled);
        
        // Update cursor based on navigation mode
        if (enabled) {
            document.body.style.cursor = 'grab';
            
            // Only attach events once
            if (!this._navigationEventsAttached) {
                this._navigationEventsAttached = true;
                
                // Change cursor on mouse down (dragging)
                this.stage.on('mousedown', () => {
                    if (this.isNavigationMode) {
                        document.body.style.cursor = 'grabbing';
                    }
                });
                
                // Change cursor back on mouse up (end of dragging)
                this.stage.on('mouseup', () => {
                    if (this.isNavigationMode) {
                        document.body.style.cursor = 'grab';
                    }
                });
            }
            
            // When navigation mode is enabled, deselect any selected shapes
            if (this.transformer) {
                this.transformer.nodes([]);
                this.shapeLayer.draw();
            }
        } else {
            document.body.style.cursor = 'default';
        }
    }

    private limitDragBoundaries(): void {
        // Calculate the boundaries to prevent dragging beyond virtual canvas
        const pos = this.stage.position();
        const stageWidth = this.stage.width();
        const stageHeight = this.stage.height();
        
        // Define the limits
        const maxX = 0; // Can't drag right beyond the left edge
        const maxY = 0; // Can't drag down beyond the top edge
        const minX = -(this.virtualCanvasWidth - stageWidth); // Can't drag left beyond the right edge
        const minY = -(this.virtualCanvasHeight - stageHeight); // Can't drag up beyond the bottom edge
        
        // Apply constraints
        if (pos.x > maxX) this.stage.x(maxX);
        if (pos.y > maxY) this.stage.y(maxY);
        if (pos.x < minX) this.stage.x(minX);
        if (pos.y < minY) this.stage.y(minY);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
}); 