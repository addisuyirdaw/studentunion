const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const { validatePost } = require('../middleware/validation');

const router = express.Router();

// @desc    Get all posts
// @route   GET /api/posts
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { type, category, status, search, important } = req.query;

    let where = {};
    
    // Only show published posts to non-admin users
    if (!req.user || !req.user.isAdmin) {
      where.status = 'published';
    } else if (status) {
      where.status = status;
    }

    if (type) where.type = type;
    if (category) where.category = category;
    if (important === 'true') where.important = true;
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    const postsRaw = await prisma.post.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { date: 'desc' }
      ],
      skip,
      take: limit,
      include: {
        author: { select: { name: true, email: true, role: true } },
        comments: { include: { user: { select: { name: true, email: true } } } },
        likes: { include: { user: { select: { name: true, email: true } } } },
        attendees: { include: { user: { select: { name: true, email: true, studentId: true } } } }
      }
    });

    const total = await prisma.post.count({ where });

    res.json({
      success: true,
      count: postsRaw.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      posts: postsRaw,
      data: postsRaw
    });
  } catch (error) {
    console.error('Get posts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching posts'
    });
  }
});

// @desc    Get single post
// @route   GET /api/posts/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { name: true, email: true, role: true } },
        comments: { include: { user: { select: { name: true, email: true } } } },
        likes: { include: { user: { select: { name: true, email: true } } } },
        attendees: { include: { user: { select: { name: true, email: true, studentId: true } } } }
      }
    });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if ((!req.user || !req.user.isAdmin) && post.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Increment views
    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
      include: {
        author: { select: { name: true, email: true, role: true } },
        comments: { include: { user: { select: { name: true, email: true } } } },
        likes: { include: { user: { select: { name: true, email: true } } } },
        attendees: { include: { user: { select: { name: true, email: true, studentId: true } } } }
      }
    });

    return res.json({
      success: true,
      post: updatedPost
    });
  } catch (error) {
    console.error('Get post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching post'
    });
  }
});

// @desc    Create new post
// @route   POST /api/posts
// @access  Private/Admin
router.post('/', protect, adminOnly, validatePost, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      type, 
      category, 
      date, 
      image, 
      location, 
      time, 
      eventDate,
      important, 
      expiryDate, 
      targetAudience,
      tags,
      isPinned,
      scheduledFor
    } = req.body;

    const postData = {
      title,
      content,
      type: type || 'News',
      category: category || 'General',
      date: date ? new Date(date) : new Date(),
      authorId: req.user.id,
      image: image || null,
      tags: tags || []
    };

    if (type === 'Event') {
      postData.location = location;
      postData.time = time;
      if (eventDate) postData.eventDate = new Date(eventDate);
    }

    if (type === 'Announcement') {
      postData.important = important || false;
      if (expiryDate) postData.expiryDate = new Date(expiryDate);
      postData.targetAudience = targetAudience || 'all';
    }

    if (typeof isPinned === 'boolean') postData.isPinned = isPinned;
    if (scheduledFor) postData.scheduledFor = new Date(scheduledFor);

    const post = await prisma.post.create({
      data: postData,
      include: {
        author: { select: { name: true, email: true, role: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating post'
    });
  }
});

// @desc    Update post
// @route   PUT /api/posts/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      category, 
      image, 
      location, 
      time, 
      eventDate,
      important, 
      expiryDate, 
      targetAudience,
      tags,
      status,
      isPinned
    } = req.body;

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (category) updateData.category = category;
    if (image) updateData.image = image;
    if (tags) updateData.tags = { set: tags }; // update arrays this way? Actually, standard direct assignment `tags` works in Prisma 4+ for scalar lists
    updateData.tags = tags || post.tags;
    
    if (status) updateData.status = status;
    if (typeof isPinned === 'boolean') updateData.isPinned = isPinned;

    if (post.type === 'Event') {
      if (location) updateData.location = location;
      if (time) updateData.time = time;
      if (eventDate) updateData.eventDate = new Date(eventDate);
    }

    if (post.type === 'Announcement') {
      if (typeof important === 'boolean') updateData.important = important;
      if (expiryDate) updateData.expiryDate = new Date(expiryDate);
      if (targetAudience) updateData.targetAudience = targetAudience;
    }

    const updatedPost = await prisma.post.update({
      where: { id: req.params.id },
      data: updateData,
      include: { author: { select: { name: true, email: true, role: true } } }
    });

    return res.json({
      success: true,
      message: 'Post updated successfully',
      post: updatedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating post'
    });
  }
});

// @desc    Delete post
// @route   DELETE /api/posts/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    await prisma.postLike.deleteMany({ where: { postId: req.params.id } });
    await prisma.postComment.deleteMany({ where: { postId: req.params.id } });
    await prisma.postAttendee.deleteMany({ where: { postId: req.params.id } });
    await prisma.postImage.deleteMany({ where: { postId: req.params.id } });
    await prisma.post.delete({ where: { id: req.params.id } });

    return res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting post'
    });
  }
});

// @desc    Like/Unlike post
// @route   POST /api/posts/:id/like
// @access  Private
router.post('/:id/like', protect, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) { return res.status(404).json({ success: false, message: 'Post not found' }); }

    const existingLike = await prisma.postLike.findFirst({
      where: { postId: post.id, userId: req.user.id }
    });
    
    let isLiked = false;
    if (existingLike) {
      // Unlike
      await prisma.postLike.delete({ where: { id: existingLike.id } });
    } else {
      // Like
      await prisma.postLike.create({
        data: { postId: post.id, userId: req.user.id }
      });
      isLiked = true;
    }

    const likeCount = await prisma.postLike.count({ where: { postId: post.id } });

    return res.json({
      success: true,
      message: isLiked ? 'Post liked' : 'Post unliked',
      liked: isLiked,
      likeCount
    });
  } catch (error) {
    console.error('Like post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error liking post'
    });
  }
});

// @desc    Add comment to post
// @route   POST /api/posts/:id/comments
// @access  Private
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) { return res.status(404).json({ success: false, message: 'Post not found' }); }

    const comment = await prisma.postComment.create({
      data: {
        postId: post.id,
        userId: req.user.id,
        content: content.trim()
      },
      include: { user: { select: { name: true, email: true } } }
    });

    return res.json({
      success: true,
      message: 'Comment added successfully',
      comment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error adding comment'
    });
  }
});

// @desc    Register for event
// @route   POST /api/posts/:id/register
// @access  Private
router.post('/:id/register', protect, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) { return res.status(404).json({ success: false, message: 'Post not found' }); }

    if (post.type !== 'Event') {
      return res.status(400).json({ success: false, message: 'This is not an event post' });
    }

    const existingRegistration = await prisma.postAttendee.findFirst({
      where: { postId: post.id, userId: req.user.id }
    });

    if (existingRegistration) {
      return res.status(400).json({ success: false, message: 'You are already registered for this event' });
    }

    const attendeeCount = await prisma.postAttendee.count({ where: { postId: post.id } });

    if (post.maxAttendees && attendeeCount >= post.maxAttendees) {
      return res.status(400).json({ success: false, message: 'Event is full' });
    }

    await prisma.postAttendee.create({
      data: { postId: post.id, userId: req.user.id }
    });

    return res.json({
      success: true,
      message: 'Successfully registered for event',
      attendeeCount: attendeeCount + 1
    });
  } catch (error) {
    console.error('Register for event error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error registering for event'
    });
  }
});

// @desc    Get post statistics
// @route   GET /api/posts/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalPosts = await prisma.post.count();
    const publishedPosts = await prisma.post.count({ where: { status: 'published' } });
    const draftPosts = await prisma.post.count({ where: { status: 'draft' } });
    const pinnedPosts = await prisma.post.count({ where: { isPinned: true } });

    // Posts by type
    const typesRaw = await prisma.post.groupBy({
      by: ['type'], _count: { type: true }
    });
    const postsByType = typesRaw.map(c => ({ _id: c.type, count: c._count.type })).sort((a,b) => b.count - a.count);

    // Posts by category
    const catRaw = await prisma.post.groupBy({
      by: ['category'], _count: { category: true }
    });
    const postsByCategory = catRaw.map(c => ({ _id: c.category, count: c._count.category })).sort((a,b) => b.count - a.count);

    // Total views and engagement
    const engagementStatsRaw = await prisma.post.aggregate({
      _sum: { views: true }
    });
    const totalViews = engagementStatsRaw._sum.views || 0;
    
    const totalLikes = await prisma.postLike.count();
    const totalComments = await prisma.postComment.count();

    // Recent posts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentPosts = await prisma.post.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    });

    const popularPosts = await prisma.post.findMany({
      where: { status: 'published' },
      select: { title: true, views: true },
      orderBy: { views: 'desc' },
      take: 5
    });

    return res.json({
      success: true,
      stats: {
        totalPosts,
        publishedPosts,
        draftPosts,
        pinnedPosts,
        recentPosts,
        totalViews,
        totalLikes,
        totalComments,
        postsByType,
        postsByCategory,
        popularPosts
      }
    });
  } catch (error) {
    console.error('Get post stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching post statistics'
    });
  }
});

module.exports = router;